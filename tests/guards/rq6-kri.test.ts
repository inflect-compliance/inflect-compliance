/**
 * RQ-6 ratchet — KRI stays wired: two models + migration (RLS), the pure
 * computeRag + CRUD/readings service, the routes, and the KRI page.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('RQ-6 KRI', () => {
    it('schema declares both models + migration with RLS', () => {
        const schema = readPrismaSchema();
        expect(schema).toMatch(/model KeyRiskIndicator/);
        expect(schema).toMatch(/model KriReading/);
        const mig = 'prisma/migrations/20260610220000_rq6_kri/migration.sql';
        expect(exists(mig)).toBe(true);
        expect(read(mig)).toMatch(/CREATE POLICY tenant_isolation ON "KeyRiskIndicator"/);
        expect(read(mig)).toMatch(/CREATE POLICY tenant_isolation ON "KriReading"/);
    });

    it('the service exposes pure computeRag + CRUD + readings', () => {
        const src = read('src/app-layer/usecases/key-risk-indicator.ts');
        expect(src).toMatch(/export function computeRag/);
        for (const fn of ['createKri', 'updateKri', 'deleteKri', 'listKris', 'recordReading', 'batchRecordReadings', 'getReadings']) {
            expect(src).toContain(`export async function ${fn}`);
        }
        expect(src).toMatch(/KRI_THRESHOLD_BREACH/);
    });

    it('the routes + KRI page exist', () => {
        expect(exists('src/app/api/t/[tenantSlug]/risks/kri/route.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/risks/kri/[kriId]/route.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/risks/kri/[kriId]/readings/route.ts')).toBe(true);
        expect(exists('src/app/t/[tenantSlug]/(app)/risks/kri/page.tsx')).toBe(true);
    });
});
