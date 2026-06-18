/**
 * Canonical KPI-sparkline COLOURS — distinct per page.
 *
 * Two-part lock:
 *
 *  1. Runtime invariant — `assignSparklineVariants` (the canonical allocator in
 *     `@/lib/charts/kpi-trends`) never hands two cards on the same page the same
 *     colour, for any row of ≤ palette-size cards, under REAL randomness. This
 *     is the property the whole feature rests on; the sweep runs it thousands
 *     of times so a future refactor that breaks distinctness fails CI.
 *
 *  2. Structural wiring — every entity KPI page routes its sparkline colour
 *     through the allocator (`assignSparklineVariants(...)`) AND feeds each card
 *     a `sparklineVariant`. Before this, only Assets had per-card colours; every
 *     other page defaulted all sparklines to `brand` (one colour). A page that
 *     drops the allocator regresses to the mono-colour state and fails here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    assignSparklineVariants,
    SPARKLINE_VARIANTS,
} from '@/lib/charts/kpi-trends';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Assets is intentionally absent: it predates the allocator and achieves
// distinct sparkline colours via its curated per-card `accent` palette
// (indigo/emerald/rose/slate → distinct MiniAreaChart variants), locked by
// tests/rendered/kpi-filter-card-accent.test.tsx. Every OTHER page routes
// colour through the canonical random allocator.
const CLIENTS: Record<string, string> = {
    Controls: 'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
    Risks: 'src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx',
    Evidence: 'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx',
    Policies: 'src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx',
    Vendors: 'src/app/t/[tenantSlug]/(app)/vendors/VendorsClient.tsx',
    Tests: 'src/app/t/[tenantSlug]/(app)/tests/page.tsx',
    Tasks: 'src/app/t/[tenantSlug]/(app)/tasks/TasksClient.tsx',
};

describe('KPI sparkline colours — distinct per page', () => {
    it('the allocator never repeats a colour for 2..6 cards (real-random sweep)', () => {
        for (let trial = 0; trial < 2000; trial++) {
            for (let n = 2; n <= SPARKLINE_VARIANTS.length; n++) {
                const keys = Array.from({ length: n }, (_, i) => `k${i}`);
                // Default rng = Math.random — exercises the production path.
                const out = assignSparklineVariants(keys);
                const colours = keys.map((k) => out[k]);
                expect(new Set(colours).size).toBe(n);
            }
        }
    });

    it.each(Object.entries(CLIENTS))(
        '%s routes sparkline colours through the canonical allocator',
        (_name, file) => {
            const src = read(file);
            // (a) the page computes a per-card colour map from the allocator
            expect(src).toMatch(/assignSparklineVariants\(/);
            // (b) at least one card is fed an explicit sparklineVariant
            expect(src).toMatch(/sparklineVariant=\{/);
        },
    );
});
