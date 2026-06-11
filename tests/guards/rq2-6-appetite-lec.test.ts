/**
 * RQ2-6 — appetite-on-LEC + breach→task ratchet.
 *
 * Regression classes guarded:
 *
 *   - the per-risk appetite marker disappearing from the dashboard
 *     LEC, or the portfolio ceiling sneaking ONTO the curve (it's a
 *     Σ-constraint — drawing it as a per-risk x-threshold would lie);
 *   - the breach→task flow losing its one-task-per-breach claim or
 *     its server-derived content (a client-supplied title would let
 *     the audit trail drift from the breach row);
 *   - the migration / schema column drifting apart.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const usecase = read('src/app-layer/usecases/risk-appetite.ts');
const route = read('src/app/api/t/[tenantSlug]/risk-appetite/breaches/[id]/remediation-task/route.ts');
const chart = read('src/components/ui/charts/loss-exceedance-curve.tsx');
const dashboard = read('src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx');
const adminPage = read('src/app/t/[tenantSlug]/(app)/admin/risk-appetite/page.tsx');
const schema = read('prisma/schema/compliance.prisma');
const migration = read('prisma/migrations/20260611120000_rq2_6_breach_remediation_task/migration.sql');

describe('RQ2-6 — appetite thresholds on the LEC', () => {
    test('the chart supports reference lines and stretches the domain to include them', () => {
        expect(chart).toMatch(/referenceLines\?:/);
        expect(chart).toMatch(/\.\.\.\(referenceLines \?\? \[\]\)\.map\(\(l\) => l\.value\)/);
        expect(chart).toMatch(/lec-reference-line/);
    });

    test('the dashboard draws the per-risk cap as a line — and the portfolio ceiling as text, never a line', () => {
        expect(dashboard).toMatch(/singleRiskAleMax/);
        expect(dashboard).toMatch(/Per-risk appetite/);
        // The Σ-constraint stays an annotation.
        expect(dashboard).toMatch(/lec-portfolio-appetite-note/);
        const refBlock = dashboard.slice(
            dashboard.indexOf('referenceLines={'),
            dashboard.indexOf('/>', dashboard.indexOf('referenceLines={')),
        );
        expect(refBlock).not.toMatch(/totalAleThreshold/);
    });
});

describe('RQ2-6 — breach → remediation task contract', () => {
    test('one task per breach: conditional claim on remediationTaskId null', () => {
        expect(usecase).toMatch(/remediationTaskId: null/);
        expect(usecase).toMatch(/updateMany/);
        expect(usecase).toMatch(/createBreachRemediationTask/);
    });

    test('task content derives server-side — the POST route accepts no body fields', () => {
        expect(route).toMatch(/export const POST = withApiErrorHandling/);
        expect(route).not.toMatch(/withValidatedBody/);
        for (const banned of ['title', 'description', 'priority']) {
            expect(route).not.toMatch(new RegExp(`${banned}\\s*:\\s*z\\.`));
        }
    });

    test('composes the canonical task usecases (no parallel creation path)', () => {
        expect(usecase).toMatch(/import \{ createTask, addTaskLink \} from '\.\/task'/);
        expect(usecase).not.toMatch(/db\.workItem\.create|db\.task\.create/);
    });

    test('schema column + migration stay paired', () => {
        expect(schema).toMatch(/remediationTaskId\s+String\?/);
        expect(migration).toMatch(/ADD COLUMN "remediationTaskId" TEXT/);
    });

    test('the admin breach list wires both states (create + view task)', () => {
        expect(adminPage).toMatch(/breach-task-create-/);
        expect(adminPage).toMatch(/breach-task-link-/);
        expect(adminPage).toMatch(/remediation-task/);
    });
});
