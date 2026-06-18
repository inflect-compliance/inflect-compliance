/**
 * One-off backfill — seed the forward-only KPI-sparkline columns on HISTORICAL
 * ComplianceSnapshot rows with each tenant's CURRENT value, so the new KPI
 * sparklines render immediately (a flat baseline that then varies forward)
 * instead of waiting ~2 days for daily snapshots to accrue.
 *
 * Columns seeded (all added 2026-06-18 across PR2/PR3 + the colour PR; existing
 * rows read NULL, or 0 for `testPlansTotal`):
 *   evidence  Draft / Submitted / Approved
 *   policies  Draft / InReview / Approved
 *   vendors   Active / Critical
 *   risks     AvgScore / OverdueReview
 *   testPlans Total / Active / Paused / Archived
 *   tasks     DueSoon7d
 *
 * ## Why a flat baseline is acceptable
 * We only know each metric's CURRENT value — historical bucket counts can't be
 * reconstructed. So the backfill writes today's value onto past rows: the
 * sparkline shows a flat line until today, then tracks real movement forward.
 * The operator chose this over "forward-only + wait" to make the cards visible
 * immediately.
 *
 * ## Safety
 *   - `--dry-run` is the DEFAULT (counts only). Writes require `--execute`.
 *   - Idempotent: only touches rows where the column IS NULL (`testPlansTotal`
 *     where 0), so post-deploy rows with real captured values are never
 *     clobbered, and a second run no-ops.
 *   - Per-tenant error isolation — one failed tenant doesn't abort the rest.
 *   - Runs inside each tenant's RLS context via `withTenantDb`.
 *
 * ## Order of deployment
 *   1. Apply the migrations (risk / test-plan / tasks columns). ✅ in CI deploy.
 *   2. Worker on the new snapshot code (so going-forward rows populate). ✅
 *   3. Run this backfill (covers historical rows).
 *
 *   npx tsx scripts/backfill-kpi-snapshot-cols.ts                     # dry-run, all tenants
 *   npx tsx scripts/backfill-kpi-snapshot-cols.ts --execute           # write, all tenants
 *   npx tsx scripts/backfill-kpi-snapshot-cols.ts --execute <tenantId> # write, one tenant
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTenantDb } from '@/lib/db-context';

interface TenantResult {
    tenantId: string;
    rowsUpdated: number;
}

async function backfillTenant(
    tenantId: string,
    execute: boolean,
): Promise<TenantResult> {
    return withTenantDb(tenantId, async (db) => {
        const now = new Date();
        const dueSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const [
            evidenceByStatus,
            policyByStatus,
            vendorsActive,
            vendorsCritical,
            riskAgg,
            risksOverdueReview,
            testPlanByStatus,
            testPlansTotal,
            tasksDueSoon7d,
        ] = await Promise.all([
            db.evidence.groupBy({
                by: ['status'],
                where: { tenantId, deletedAt: null, isArchived: false },
                _count: true,
            }),
            db.policy.groupBy({
                by: ['status'],
                where: { tenantId, deletedAt: null },
                _count: true,
            }),
            db.vendor.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
            db.vendor.count({ where: { tenantId, deletedAt: null, criticality: 'CRITICAL' } }),
            db.risk.aggregate({ _avg: { inherentScore: true }, where: { tenantId, deletedAt: null } }),
            db.risk.count({ where: { tenantId, deletedAt: null, nextReviewAt: { lt: now } } }),
            db.controlTestPlan.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
            db.controlTestPlan.count({ where: { tenantId } }),
            db.task.count({ where: { tenantId, deletedAt: null, dueAt: { gte: now, lte: dueSoon } } }),
        ]);

        const ev = (s: string) => evidenceByStatus.find((g) => g.status === s)?._count ?? 0;
        const pol = (s: string) => policyByStatus.find((g) => g.status === s)?._count ?? 0;
        const tp = (s: string) => testPlanByStatus.find((g) => g.status === s)?._count ?? 0;

        // Nullable columns: backfill rows still NULL with the current value.
        // `risksAvgScore` is null when the tenant has no risks — skip it then.
        const nullableCols: Array<{
            field: keyof Prisma.ComplianceSnapshotUpdateManyMutationInput;
            value: number | null;
        }> = [
            { field: 'evidenceDraft', value: ev('DRAFT') },
            { field: 'evidenceSubmitted', value: ev('SUBMITTED') },
            { field: 'evidenceApproved', value: ev('APPROVED') },
            { field: 'policiesDraft', value: pol('DRAFT') },
            { field: 'policiesInReview', value: pol('IN_REVIEW') },
            { field: 'policiesApproved', value: pol('APPROVED') },
            { field: 'vendorsActive', value: vendorsActive },
            { field: 'vendorsCritical', value: vendorsCritical },
            { field: 'risksAvgScore', value: riskAgg._avg.inherentScore },
            { field: 'risksOverdueReview', value: risksOverdueReview },
            { field: 'testPlansActive', value: tp('ACTIVE') },
            { field: 'testPlansPaused', value: tp('PAUSED') },
            { field: 'testPlansArchived', value: tp('ARCHIVED') },
            { field: 'tasksDueSoon7d', value: tasksDueSoon7d },
        ];

        let rowsUpdated = 0;

        for (const { field, value } of nullableCols) {
            if (value == null) continue;
            const where = { tenantId, [field]: null } as Prisma.ComplianceSnapshotWhereInput;
            if (!execute) {
                rowsUpdated += await db.complianceSnapshot.count({ where });
                continue;
            }
            const res = await db.complianceSnapshot.updateMany({
                where,
                data: { [field]: value } as Prisma.ComplianceSnapshotUpdateManyMutationInput,
            });
            rowsUpdated += res.count;
        }

        // `testPlansTotal` is NOT NULL DEFAULT 0 — seed rows still at 0.
        const tpWhere: Prisma.ComplianceSnapshotWhereInput = { tenantId, testPlansTotal: 0 };
        if (!execute) {
            rowsUpdated += await db.complianceSnapshot.count({ where: tpWhere });
        } else {
            const res = await db.complianceSnapshot.updateMany({
                where: tpWhere,
                data: { testPlansTotal },
            });
            rowsUpdated += res.count;
        }

        return { tenantId, rowsUpdated };
    });
}

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const tenantArg = args.find((a) => !a.startsWith('--'));

    const tenants = tenantArg
        ? [{ id: tenantArg }]
        : await prisma.tenant.findMany({ select: { id: true } });

    console.log(
        `[backfill-kpi-snapshot-cols] ${execute ? 'EXECUTE' : 'DRY-RUN'} — ${tenants.length} tenant(s)`,
    );

    let ok = 0;
    let errored = 0;
    let totalRows = 0;
    for (const t of tenants) {
        try {
            const r = await backfillTenant(t.id, execute);
            ok++;
            totalRows += r.rowsUpdated;
            console.log(
                `  ${execute ? 'updated' : 'would update'} ${r.rowsUpdated} row-col(s)  tenant=${t.id}`,
            );
        } catch (err) {
            errored++;
            console.error(`  FAILED tenant=${t.id}:`, err instanceof Error ? err.message : err);
        }
    }

    console.log(
        `[backfill-kpi-snapshot-cols] done — ${ok}/${tenants.length} tenant(s), ` +
            `${totalRows} row-col write(s) ${execute ? 'applied' : '(dry-run, nothing written)'}, ${errored} error(s)`,
    );
    await prisma.$disconnect();
    if (errored > 0) process.exit(1);
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[backfill-kpi-snapshot-cols] fatal', err);
        process.exit(2);
    });
}
