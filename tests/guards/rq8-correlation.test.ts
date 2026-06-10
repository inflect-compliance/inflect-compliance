/**
 * RQ-8 ratchet — correlation stays wired: model + migration (RLS), the
 * pure Cholesky/correlated-sampling (monte-carlo) + PSD/CRUD/suggest
 * service, the routes, and the matrix page.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('RQ-8 correlation', () => {
    it('RiskCorrelation model + migration with RLS', () => {
        expect(read('prisma/schema/compliance.prisma')).toMatch(/model RiskCorrelation/);
        const mig = 'prisma/migrations/20260610240000_rq8_correlation/migration.sql';
        expect(exists(mig)).toBe(true);
        expect(read(mig)).toMatch(/CREATE POLICY tenant_isolation ON "RiskCorrelation"/);
    });

    it('monte-carlo exposes Cholesky + correlated-uniform sampling', () => {
        const src = read('src/app-layer/usecases/monte-carlo.ts');
        expect(src).toMatch(/export function choleskyDecompose/);
        expect(src).toMatch(/export function generateCorrelatedUniforms/);
        expect(src).toMatch(/correlationMatrix/);
    });

    it('the service exposes PSD + CRUD + suggestions', () => {
        const src = read('src/app-layer/usecases/risk-correlation.ts');
        expect(src).toMatch(/export function validatePSD/);
        expect(src).toMatch(/export function computeSuggestions/);
        for (const fn of ['setCorrelation', 'removeCorrelation', 'getCorrelationMatrix', 'suggestCorrelations']) {
            expect(src).toContain(`export async function ${fn}`);
        }
    });

    it('the routes + matrix page exist', () => {
        expect(exists('src/app/api/t/[tenantSlug]/risks/correlations/route.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/risks/correlations/suggest/route.ts')).toBe(true);
        expect(exists('src/app/t/[tenantSlug]/(app)/risks/correlations/page.tsx')).toBe(true);
    });
});
