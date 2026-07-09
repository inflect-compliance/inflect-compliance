/**
 * PR-6 — training + background checks: structural ratchet. Provider
 * registration, encryption of the sensitive field, tenant-scoping, and the
 * three-model RLS + index shape.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('training / background — registration + wiring', () => {
    it('TrainingProvider is registered in bootstrap', () => {
        expect(read('src/app-layer/integrations/bootstrap.ts')).toMatch(/registry\.register\(new TrainingProvider\(\)\)/);
    });

    it('BackgroundCheck.resultSummary is in the encryption manifest', () => {
        const manifest = read('src/lib/security/encrypted-fields.ts');
        expect(manifest).toMatch(/BackgroundCheck: \['resultSummary'\]/);
    });

    it('the usecase is tenant-scoped; manual entry stands alone', () => {
        const uc = read('src/app-layer/usecases/training.ts');
        expect(uc).toMatch(/runInTenantContext/);
        expect(uc).not.toMatch(/from '@\/lib\/prisma'/);
        // manual create/assign/complete/record all present (no provider needed)
        for (const fn of ['createTrainingCourse', 'assignTraining', 'completeTrainingAssignment', 'recordBackgroundCheck']) {
            expect(uc).toMatch(new RegExp(`export async function ${fn}`));
        }
    });

    it('three models carry RLS + tenant indexes', () => {
        const schema = readPrismaSchema();
        for (const m of ['TrainingCourse', 'TrainingAssignment', 'BackgroundCheck']) {
            expect(schema).toMatch(new RegExp(`model ${m} \\{`));
        }
        expect(schema).toMatch(/@@unique\(\[tenantId, name\]\)/); // TrainingCourse
        const mig = read('prisma/migrations/20260707130000_training_background/migration.sql');
        expect(mig).toMatch(/FORCE ROW LEVEL SECURITY/);
        expect(mig).toMatch(/ARRAY\['TrainingCourse','TrainingAssignment','BackgroundCheck'\]/);
    });

    it('background-check list projection omits the sensitive resultSummary', () => {
        const uc = read('src/app-layer/usecases/training.ts');
        // listBackgroundChecks select must not include resultSummary
        const listBlock = uc.slice(uc.indexOf('export async function listBackgroundChecks'), uc.indexOf('export async function recordBackgroundCheck'));
        expect(listBlock).not.toMatch(/resultSummary: true/);
    });
});
