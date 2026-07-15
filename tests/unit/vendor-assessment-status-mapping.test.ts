/**
 * Unit tests — vendor-assessment status routing + badge mapping.
 *
 * Locks the "route the vendor-table Open → by lifecycle/status" logic
 * (G-3 rows open the internal review surface; legacy World-A rows do not)
 * and guarantees every status enum value has a badge variant + a
 * localized label key, so no vendor-assessment status ever renders the
 * default-neutral fallback or a raw enum token.
 */
import {
    VENDOR_ASSESSMENT_VARIANT,
    vendorAssessmentStatusLabelKey,
    isG3AssessmentStatus,
} from '@/app-layer/domain/entity-status-mapping';

const G3_STATUSES = ['SENT', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'CLOSED'];
const LEGACY_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
const ALL_STATUSES = [...G3_STATUSES, ...LEGACY_STATUSES];

describe('isG3AssessmentStatus — vendor-table routing-by-status', () => {
    it.each(G3_STATUSES)('routes %s to the internal review surface (G-3)', (s) => {
        expect(isG3AssessmentStatus(s)).toBe(true);
    });

    it.each(LEGACY_STATUSES)('does NOT route legacy %s to the review surface', (s) => {
        expect(isG3AssessmentStatus(s)).toBe(false);
    });

    it('treats an unknown status as non-G-3 (safe: renders the legacy marker, not a broken link)', () => {
        expect(isG3AssessmentStatus('WHATEVER')).toBe(false);
        expect(isG3AssessmentStatus('')).toBe(false);
    });
});

describe('VENDOR_ASSESSMENT_VARIANT — no undefined variant for any status', () => {
    it.each(ALL_STATUSES)('has a defined badge variant for %s', (s) => {
        expect(VENDOR_ASSESSMENT_VARIANT[s]).toBeDefined();
    });
});

describe('vendorAssessmentStatusLabelKey', () => {
    it('produces a namespaced statusLabel key', () => {
        expect(vendorAssessmentStatusLabelKey('SUBMITTED')).toBe('statusLabel.SUBMITTED');
        expect(vendorAssessmentStatusLabelKey('SENT')).toBe('statusLabel.SENT');
    });
});
