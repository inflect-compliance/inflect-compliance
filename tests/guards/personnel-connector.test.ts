/**
 * PR-4 — personnel / HRIS: structural ratchet. Provider registration, HRIS
 * job wiring, tenant-scoping, and the Employee RLS + tenant-index shape.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('personnel / HRIS — registration + wiring', () => {
    it('BambooHR + Personnel providers are registered in bootstrap', () => {
        const boot = read('src/app-layer/integrations/bootstrap.ts');
        expect(boot).toMatch(/registry\.register\(new BambooHrProvider\(\)\)/);
        expect(boot).toMatch(/registry\.register\(new PersonnelProvider\(\)\)/);
    });

    it('hris-sync jobs are typed + registered', () => {
        const types = read('src/app-layer/jobs/types.ts');
        expect(types).toMatch(/'hris-sync': HrisSyncPayload/);
        expect(types).toMatch(/'hris-sync-dispatch': HrisSyncDispatchPayload/);
        const reg = read('src/app-layer/jobs/executor-registry.ts');
        expect(reg).toMatch(/executorRegistry\.register\('hris-sync'/);
        expect(reg).toMatch(/executorRegistry\.register\('hris-sync-dispatch'/);
        expect(read('src/app-layer/jobs/schedules.ts')).toMatch(/name: 'hris-sync-dispatch'/);
    });

    it('the hris-sync + personnel usecases are tenant-scoped (no global prisma)', () => {
        const hris = read('src/app-layer/usecases/hris-sync.ts');
        expect(hris).toMatch(/runInTenantContext/);
        expect(hris).not.toMatch(/from '@\/lib\/prisma'/);
        expect(read('src/app-layer/usecases/personnel.ts')).toMatch(/runInTenantContext/);
    });

    it('Employee carries RLS + tenant indexes + self-FK', () => {
        const schema = read('prisma/schema/compliance.prisma');
        expect(schema).toMatch(/model Employee \{/);
        expect(schema).toMatch(/@@unique\(\[tenantId, workEmail\]\)/);
        expect(schema).toMatch(/@@index\(\[tenantId, status\]\)/);
        expect(schema).toMatch(/@@index\(\[tenantId, managerEmployeeId\]\)/);
        const mig = read('prisma/migrations/20260707110000_personnel/migration.sql');
        expect(mig).toMatch(/ENABLE ROW LEVEL SECURITY/);
        expect(mig).toMatch(/FORCE ROW LEVEL SECURITY/);
        expect(mig).toMatch(/CREATE POLICY tenant_isolation ON "Employee"/);
        expect(mig).toMatch(/Employee_managerEmployeeId_fkey/);
    });

    it('personnel permission key exists in the PermissionSet', () => {
        const perms = read('src/lib/permissions.ts');
        expect(perms).toMatch(/personnel: \{ view: boolean; manage: boolean \}/);
        expect(perms).toMatch(/personnel: \['view', 'manage'\]/);
    });
});
