/**
 * Vendor-doc extraction pure units — the sanitize boundary, the Zod
 * extraction schema (shape + value), and the curated SOC 2 → question map.
 */
import { sanitizeDocText, DocExtractionSchema } from '@/app-layer/ai/vendor-doc';
import { controlEvidencesQuestion, topicForControl } from '@/app-layer/services/soc2-question-map';

describe('sanitizeDocText — privacy boundary', () => {
    it('redacts email + phone PII', () => {
        const out = sanitizeDocText('Contact jane.doe@acme.io or +1 (555) 123-4567 for details.');
        expect(out).not.toMatch(/jane\.doe@acme\.io/);
        expect(out).toContain('[email]');
        expect(out).toContain('[phone]');
    });

    it('strips control chars + caps length', () => {
        const out = sanitizeDocText('a\x00b\x07c', 100);
        expect(out).toBe('abc');
        expect(sanitizeDocText('x'.repeat(500), 10)).toHaveLength(10);
    });
});

describe('DocExtractionSchema — shape + value validation', () => {
    it('accepts a well-formed SOC 2 extraction', () => {
        const r = DocExtractionSchema.safeParse({
            reportType: 'SOC2_TYPE2',
            auditPeriodStart: '2025-06-01',
            auditPeriodEnd: '2026-05-31',
            scope: 'Production systems',
            auditor: 'Acme CPAs',
            trustServiceCriteria: ['CC6.1'],
            controls: [{ ref: 'CC6.1', description: 'Access control', result: 'IN_PLACE' }],
            exceptions: [{ control: 'CC8.1', description: 'A change was deployed without approval' }],
        });
        expect(r.success).toBe(true);
    });

    it('rejects an invalid report type (value validation)', () => {
        const r = DocExtractionSchema.safeParse({ reportType: 'NONSENSE', controls: [] });
        expect(r.success).toBe(false);
    });

    it('defaults arrays so a sparse model response still validates', () => {
        const r = DocExtractionSchema.safeParse({ reportType: 'ISO27001' });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.controls).toEqual([]);
            expect(r.data.exceptions).toEqual([]);
        }
    });
});

describe('SOC 2 → question mapping — curated + transparent', () => {
    it('maps a control ref to its topic', () => {
        expect(topicForControl('CC6.1')?.label).toBe('Access control');
        expect(topicForControl('A1.2')?.label).toBe('Availability & resilience');
        expect(topicForControl('ZZ9.9')).toBeNull();
    });

    it('a control evidences a question only when topic keywords appear', () => {
        expect(controlEvidencesQuestion('CC6.1', 'Do you enforce role-based access control?')).toBe(true);
        expect(controlEvidencesQuestion('CC6.1', 'Do you have a backup policy?')).toBe(false);
        expect(controlEvidencesQuestion('A1.1', 'Describe your disaster recovery plan.')).toBe(true);
        // uncurated control never matches.
        expect(controlEvidencesQuestion('ZZ9.9', 'Do you enforce access control?')).toBe(false);
    });
});
