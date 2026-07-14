/**
 * EP-4 Part 1 — Evidence list KPI strips are SERVER-sourced.
 *
 * Structural lock (mirrors the Tasks TP-7 `task-kpi-consistency` idea): the
 * Evidence list KPI cards must read the tenant-wide server aggregate
 * (`getEvidenceRetentionMetrics` → SWR-seeded `initialMetrics`), NOT a count
 * over the ≤100 loaded rows. Before EP-4 the strip counted `evidence.length`
 * / `evidence.filter(...).length`, which silently under-reported past the
 * 100-row SSR cap. These assertions fail CI if a regression re-introduces the
 * client-row count.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CLIENT = readFileSync(
    resolve(__dirname, '../../src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx'),
    'utf-8',
);
const PAGE = readFileSync(
    resolve(__dirname, '../../src/app/t/[tenantSlug]/(app)/evidence/page.tsx'),
    'utf-8',
);

describe('Evidence KPI strips — server-sourced (EP-4)', () => {
    it('reads the retention aggregate via useTenantSWR seeded by initialMetrics', () => {
        expect(CLIENT).toMatch(/useTenantSWR<EvidenceRetentionMetrics>/);
        expect(CLIENT).toContain('CACHE_KEYS.evidence.retention()');
        expect(CLIENT).toMatch(/fallbackData:\s*initialMetrics/);
    });

    it('binds the status KPI cards to metrics.byStatus, not a loaded-row count', () => {
        expect(CLIENT).toContain('const totalEvidence = metrics.total');
        expect(CLIENT).toContain('metrics.byStatus.DRAFT');
        expect(CLIENT).toContain('metrics.byStatus.SUBMITTED');
        expect(CLIENT).toContain('metrics.byStatus.APPROVED');
        // The old client-row counts are gone.
        expect(CLIENT).not.toContain('const totalEvidence = evidence.length');
        expect(CLIENT).not.toMatch(/evidence\.filter\(\(ev\) => ev\.status === 'DRAFT'\)\.length/);
    });

    it('binds the freshness KPI cards to the server buckets', () => {
        expect(CLIENT).toContain('current: metrics.current');
        expect(CLIENT).toContain('expiring: metrics.expiringSoon');
        expect(CLIENT).toContain('expired: metrics.expired');
        expect(CLIENT).toContain('needs_review: metrics.needsReview');
        // The old per-row freshness pass is gone.
        expect(CLIENT).not.toContain('counts[evidenceFreshnessBucket(ev, hydratedNow)]');
    });

    it('judges the "all current" celebration from the server aggregate', () => {
        expect(CLIENT).toContain('const allEvidenceCurrent =');
        expect(CLIENT).toMatch(/metrics\.expired === 0/);
        expect(CLIENT).toMatch(/metrics\.expiringSoon === 0/);
        expect(CLIENT).toMatch(/metrics\.needsReview === 0/);
        // No longer counts the loaded rows client-side for the milestone.
        expect(CLIENT).not.toContain('isAllEvidenceCurrent(evidence');
    });

    it('the page passes initialMetrics from getEvidenceRetentionMetrics', () => {
        expect(PAGE).toContain('getEvidenceRetentionMetrics');
        expect(PAGE).toMatch(/initialMetrics=\{/);
    });
});
