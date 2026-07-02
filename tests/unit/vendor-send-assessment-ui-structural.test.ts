/**
 * Epic G-3 — structural wiring check for the vendor detail page's
 * "Send to vendor" assessment flow.
 *
 * A light static-analysis guard (no React render): asserts the page
 * wires the G-3 send flow end-to-end and keeps the legacy in-app
 * "Start" flow intact. Complements the route handler's behavioural
 * test (`vendor-assessment-send-route.test.ts`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const PAGE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/page.tsx',
);

describe('vendor detail — G-3 send-assessment wiring', () => {
    const src = fs.readFileSync(PAGE, 'utf8');

    it('POSTs to the G-3 send route', () => {
        expect(src).toContain('/assessments/send');
    });

    it('fetches PUBLISHED G-3 templates from the vendor-assessment-templates endpoint', () => {
        expect(src).toContain('/vendor-assessment-templates');
        expect(src).toMatch(/filter\(\(t\)\s*=>\s*t\.isPublished\)/);
    });

    it('renders the Send-to-vendor trigger + modal confirm', () => {
        expect(src).toContain('send-assessment-btn');
        expect(src).toContain('confirm-send-assessment');
        expect(src).toContain('Send assessment');
    });

    it('uses the platform Modal / FormField / Combobox / CopyText primitives', () => {
        expect(src).toContain("from '@/components/ui/modal'");
        expect(src).toContain("from '@/components/ui/form-field'");
        expect(src).toContain("from '@/components/ui/copy-text'");
        expect(src).toContain('<Modal');
        expect(src).toContain('<CopyText');
    });

    it('reveals the raw access link after a successful send', () => {
        expect(src).toContain('send-assessment-link');
        expect(src).toContain('/vendor-assessment/');
    });

    it('keeps the legacy in-app start flow intact', () => {
        expect(src).toContain('/assessments/start');
        expect(src).toContain('start-assessment-btn');
        expect(src).toContain('templateKey');
    });
});
