/**
 * Audit Coherence follow-up (2026-05-24) — surface the new enum
 * values added by S1 (RiskStatus.MITIGATED) and S2
 * (TestPlanStatus.ARCHIVED) in the UI. The schema changes shipped
 * with the audit roadmap, but the corresponding filter / detail
 * page / status-badge surfaces stayed pinned to the legacy value
 * sets — a write to the new state was technically possible via
 * API but invisible in every list / detail view.
 *
 * This ratchet locks the surfacing in every place a regression
 * would silently re-hide the value.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Audit-gap enum surfacing', () => {
    describe('RiskStatus.MITIGATED (Audit Coherence S1)', () => {
        const enums = read('prisma/schema/enums.prisma');
        const filterDefs = read(
            'src/app/t/[tenantSlug]/(app)/risks/filter-defs.ts',
        );
        const detail = read(
            'src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx',
        );
        const mapping = read(
            'src/app-layer/domain/entity-status-mapping.ts',
        );

        it('schema enum still carries the value (defence against rollback)', () => {
            // Pull the enum block out of the prisma file so unrelated
            // matches in other models can't false-positive.
            const block = enums.slice(
                enums.indexOf('enum RiskStatus'),
                enums.indexOf('enum RiskStatus') + 400,
            );
            expect(block).toMatch(/\bMITIGATED\b/);
        });

        it('filter-defs surfaces MITIGATED (label now via next-intl)', () => {
            // The status labels moved to a next-intl factory
            // (`riskStatusLabels(t)`); MITIGATED maps to the
            // `risks.bulkStatus.mitigated` catalog key. Assert the
            // enum→key wiring in source AND the en value.
            const start = filterDefs.indexOf('function riskStatusLabels');
            const block = filterDefs.slice(start, start + 400);
            expect(block).toMatch(/MITIGATED:\s*t\(['"]bulkStatus\.mitigated['"]\)/);
            const en = JSON.parse(read('messages/en.json')) as {
                risks: { bulkStatus: Record<string, string> };
            };
            expect(en.risks.bulkStatus.mitigated).toBe('Mitigated');
        });

        it('risk detail STATUS_VALUES includes MITIGATED', () => {
            const block = detail.slice(
                detail.indexOf('STATUS_VALUES'),
                detail.indexOf('STATUS_VALUES') + 400,
            );
            expect(block).toMatch(/['"]MITIGATED['"]/);
        });

        it('RISK_STATUS_VARIANT carries a badge tone for MITIGATED', () => {
            const block = mapping.slice(
                mapping.indexOf('RISK_STATUS_VARIANT'),
                mapping.indexOf('RISK_STATUS_VARIANT') + 400,
            );
            expect(block).toMatch(/MITIGATED:\s*['"][a-z]+['"]/);
        });
    });

    describe('TestPlanStatus.ARCHIVED (Audit Coherence S2)', () => {
        const enums = read('prisma/schema/enums.prisma');
        const detail = read(
            'src/app/t/[tenantSlug]/(app)/controls/[controlId]/tests/[planId]/page.tsx',
        );
        const list = read('src/app/t/[tenantSlug]/(app)/tests/page.tsx');

        it('schema enum still carries the value', () => {
            const block = enums.slice(
                enums.indexOf('enum TestPlanStatus'),
                enums.indexOf('enum TestPlanStatus') + 200,
            );
            expect(block).toMatch(/\bARCHIVED\b/);
        });

        it('test-plan detail PLAN_STATUS_OPTIONS exposes ARCHIVED', () => {
            const block = detail.slice(
                detail.indexOf('PLAN_STATUS_OPTIONS'),
                detail.indexOf('PLAN_STATUS_OPTIONS') + 400,
            );
            expect(block).toMatch(
                /\{\s*value:\s*['"]ARCHIVED['"]\s*,\s*label:\s*['"]Archived['"]/,
            );
        });

        it('test-plan detail badge variant lookup carries ARCHIVED', () => {
            const block = detail.slice(
                detail.indexOf('PLAN_STATUS_BADGE_VARIANT'),
                detail.indexOf('PLAN_STATUS_BADGE_VARIANT') + 400,
            );
            expect(block).toMatch(/ARCHIVED:\s*['"][a-z]+['"]/);
        });

        it('detail page renders the badge via the lookup (no inline ACTIVE-ternary)', () => {
            // Regression: pre-S2 the badge used
            //   variant={plan.status === 'ACTIVE' ? 'success' : 'warning'}
            // which silently maps ARCHIVED → "warning" (paused). The
            // lookup-table form is the only correct shape.
            expect(detail).not.toMatch(
                /variant=\{plan\.status\s*===\s*['"]ACTIVE['"]\s*\?\s*['"]success['"]\s*:\s*['"]warning['"]\}/,
            );
            expect(detail).toMatch(
                /variant=\{PLAN_STATUS_BADGE_VARIANT\[plan\.status\]/,
            );
        });

        it('tests rollup page status-badge variant lookup carries ARCHIVED', () => {
            const block = list.slice(
                list.indexOf('PLAN_STATUS_BADGE'),
                list.indexOf('PLAN_STATUS_BADGE') + 400,
            );
            expect(block).toMatch(/ARCHIVED:\s*['"][a-z]+['"]/);
            // Inline ACTIVE-ternary retired.
            expect(list).not.toMatch(
                /variant=\{row\.original\.status\s*===\s*['"]ACTIVE['"]\s*\?\s*['"]success['"]\s*:\s*['"]warning['"]\}/,
            );
        });
    });
});
