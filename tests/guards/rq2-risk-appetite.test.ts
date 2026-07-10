/**
 * RQ-2 ratchet — risk appetite framework stays wired: schema models +
 * migration, the service (pure detectBreaches + checks + persistence),
 * the monitor job + schedule, the routes, and the admin config page.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('RQ-2 risk appetite', () => {
    it('schema declares both models + migration', () => {
        const schema = readPrismaSchema();
        expect(schema).toMatch(/model RiskAppetiteConfig/);
        expect(schema).toMatch(/model RiskAppetiteBreach/);
        expect(exists('prisma/migrations/20260610140000_rq2_risk_appetite/migration.sql')).toBe(true);
    });

    it('the service exposes pure detection + checks + persistence', () => {
        const src = read('src/app-layer/usecases/risk-appetite.ts');
        expect(src).toMatch(/export function detectBreaches/);
        for (const fn of ['checkPortfolioAppetite', 'checkSingleRiskAppetite', 'recordBreaches', 'resolveStaleBreaches', 'getAppetiteStatus', 'upsertAppetiteConfig']) {
            expect(src).toContain(`export async function ${fn}`);
        }
        expect(src).toMatch(/resolveALE/); // portfolio ALE uses the RQ-1 resolver
    });

    it('the monitor job is registered + scheduled', () => {
        expect(exists('src/app-layer/jobs/risk-appetite-jobs.ts')).toBe(true);
        expect(read('src/app-layer/jobs/executor-registry.ts')).toMatch(/register\('risk-appetite-monitor'/);
        expect(read('src/app-layer/jobs/schedules.ts')).toMatch(/risk-appetite-monitor/);
    });

    it('the routes + admin config page exist', () => {
        expect(exists('src/app/api/t/[tenantSlug]/risk-appetite/route.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/risk-appetite/breaches/route.ts')).toBe(true);
        expect(exists('src/app/t/[tenantSlug]/(app)/admin/risk-appetite/page.tsx')).toBe(true);
        expect(read('src/app/t/[tenantSlug]/(app)/admin/page.tsx')).toMatch(/risk-appetite/);
    });
});
