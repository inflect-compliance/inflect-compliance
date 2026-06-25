/**
 * Structural ratchet — business-KPI metrics coverage + cardinality.
 *
 * Locks the contract in docs/observability/06-business-kpis.md:
 *   - the metrics module exists and defines every catalogue metric,
 *   - the cardinality rules hold (never `tenant.id` as a label; time
 *     labels are pre-rounded bucket strings),
 *   - every wiring-point usecase actually imports the metrics module.
 *
 * Adding a metric without wiring it (or wiring it without bounded
 * labels) fails CI here.
 */
import fs from 'fs';
import path from 'path';
import { BUSINESS_METRIC_NAMES } from '@/lib/observability/business-metrics';

const ROOT = path.resolve(__dirname, '../..');
const MODULE_REL = 'src/lib/observability/business-metrics.ts';
const MODULE_ABS = path.join(ROOT, MODULE_REL);

function read(rel: string): string {
    const p = path.join(ROOT, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

const moduleSrc = read(MODULE_REL);

/**
 * Every wiring point that MUST import the metrics module. The metric(s)
 * each one emits are noted for the human reader; the assertion only
 * checks the import is present (the metric call shape is covered by the
 * unit/integration tests).
 *
 * `src/auth.ts` is intentionally NOT here: OAuth new-vs-returning user
 * detection in the NextAuth callback is best-effort (the credentials
 * register route is the guaranteed user.signup emitter), so auth.ts
 * wiring is allowed but not required.
 */
const WIRING_POINTS: Array<{ file: string; emits: string }> = [
    { file: 'src/app-layer/usecases/tenant-lifecycle.ts', emits: 'business.tenant.created' },
    { file: 'src/app-layer/usecases/org-tenants.ts', emits: 'business.tenant.deleted' },
    { file: 'src/app/api/auth/register/route.ts', emits: 'business.tenant.created + business.user.signup' },
    { file: 'src/app-layer/usecases/tenant-invites.ts', emits: 'business.invite.sent + .redeemed' },
    { file: 'src/app-layer/usecases/mfa-enrollment.ts', emits: 'business.user.mfa.enrolled' },
    { file: 'src/app-layer/usecases/onboarding.ts', emits: 'business.onboarding.step.completed + .completed' },
    { file: 'src/app-layer/usecases/framework/install.ts', emits: 'business.framework.installed' },
    { file: 'src/app-layer/usecases/policy.ts', emits: 'business.policy.published' },
    { file: 'src/app-layer/usecases/audit-readiness/cycles.ts', emits: 'business.audit.cycle.started' },
    { file: 'src/app-layer/usecases/audit-readiness/sharing.ts', emits: 'business.audit.pack.shared' },
    { file: 'src/app-layer/usecases/risk.ts', emits: 'business.risk.created' },
    { file: 'src/app-layer/usecases/control/mutations.ts', emits: 'business.control.created' },
    { file: 'src/app-layer/usecases/automation-rules.ts', emits: 'business.automation.rule.created' },
    { file: 'src/app-layer/usecases/billing.ts', emits: 'business.plan.upgraded + .downgraded' },
    { file: 'src/lib/billing/entitlements.ts', emits: 'business.plan.limit.hit' },
    { file: 'src/app-layer/jobs/dau-mau-aggregator.ts', emits: 'business.tenant.active.{daily,monthly}' },
    { file: 'src/app-layer/jobs/onboarding-abandonment-sweep.ts', emits: 'business.onboarding.abandoned' },
];

describe('business-metrics module', () => {
    it('exists', () => {
        expect(fs.existsSync(MODULE_ABS)).toBe(true);
        expect(moduleSrc.length).toBeGreaterThan(0);
    });

    it('catalogue has the full 21-metric set (brief said "14" — a miscount)', () => {
        expect(BUSINESS_METRIC_NAMES.length).toBe(21);
        // No duplicates.
        expect(new Set(BUSINESS_METRIC_NAMES).size).toBe(BUSINESS_METRIC_NAMES.length);
    });

    it('defines a metric for every catalogue name (each name appears as a literal)', () => {
        for (const name of BUSINESS_METRIC_NAMES) {
            // Each metric name must be created/observed somewhere in the module.
            expect(moduleSrc).toContain(`'${name}'`);
        }
    });

    it('every metric name is in the business.* namespace', () => {
        for (const name of BUSINESS_METRIC_NAMES) {
            expect(name.startsWith('business.')).toBe(true);
        }
    });
});

describe('cardinality discipline', () => {
    it('never uses tenant.id / tenantId as a metric LABEL key', () => {
        // A label key looks like `'tenant.id':` or `tenant_id:` in a
        // label object. The docstring mentions tenant.id in backticks
        // (prose) which this regex deliberately does not match.
        const labelKeyRe = /['"]tenant[._]?id['"]\s*:/i;
        expect(labelKeyRe.test(moduleSrc)).toBe(false);
    });

    it('time-bucket labels are produced by bucketTimeTo (pre-rounded strings)', () => {
        // The bucket helper exists and returns only the 4 bounded values.
        expect(moduleSrc).toMatch(/export function bucketTimeTo/);
        expect(moduleSrc).toMatch(/'lt_1h'|'lt_1d'|'lt_1w'|'gt_1w'/);
        // Any `.bucket'` label must be fed bucketTimeTo(...), never a raw number.
        const bucketAssigns = moduleSrc.match(/\.bucket['"]\s*:\s*([^,\n]+)/g) ?? [];
        expect(bucketAssigns.length).toBeGreaterThan(0);
        for (const a of bucketAssigns) {
            expect(a).toContain('bucketTimeTo(');
        }
    });
});

describe('wiring-point coverage', () => {
    it.each(WIRING_POINTS)('$file imports business-metrics (emits $emits)', ({ file }) => {
        const src = read(file);
        expect(src.length).toBeGreaterThan(0);
        expect(src).toMatch(/observability\/business-metrics/);
    });
});
