/**
 * RQ-3 ratchet — Monte Carlo engine stays wired: schema + migration (with
 * RLS), the pure simulation core + PRNG + PERT sample, the run+latest
 * service, the route, and the dashboard panel.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('RQ-3 Monte Carlo', () => {
    it('RiskSimulationRun schema + migration with RLS', () => {
        expect(readPrismaSchema()).toMatch(/model RiskSimulationRun/);
        const mig = 'prisma/migrations/20260610160000_rq3_monte_carlo/migration.sql';
        expect(exists(mig)).toBe(true);
        expect(read(mig)).toMatch(/CREATE POLICY tenant_isolation ON "RiskSimulationRun"/);
    });

    it('the engine exposes the simulation core + PRNG + PERT sample', () => {
        const src = read('src/app-layer/usecases/monte-carlo.ts');
        expect(src).toMatch(/export function simulatePortfolio/);
        expect(src).toMatch(/export function samplePert/);
        expect(src).toMatch(/export const createPRNG/);
        expect(src).toMatch(/export async function runSimulation/);
        expect(src).toMatch(/export async function getLatestSimulation/);
        // reuses RQ-1's sampler
        expect(src).toMatch(/sampleFairALE/);
    });

    it('the route + dashboard panel exist', () => {
        expect(exists('src/app/api/t/[tenantSlug]/risks/simulate/route.ts')).toBe(true);
        expect(exists('src/app/t/[tenantSlug]/(app)/risks/dashboard/MonteCarloPanel.tsx')).toBe(true);
        expect(read('src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx')).toMatch(/MonteCarloPanel/);
    });
});
