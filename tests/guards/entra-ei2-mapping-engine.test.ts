/**
 * EI-2 ratchet — the group → role mapping engine must stay wired, and the
 * privilege-escalation invariant must stay in the mapper. (The DB-backed
 * behavioural version lands in EI-4's entra-group-no-manual-override ratchet.)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('EI-2 mapping engine', () => {
    it('schema has EntraGroupMapping + the membership provenance columns', () => {
        const schema = read('prisma/schema/auth.prisma');
        expect(schema).toMatch(/model EntraGroupMapping/);
        expect(schema).toMatch(/provisionedByEntraGroup\s+Boolean/);
        expect(schema).toMatch(/lastEntraGroupMappingId/);
        expect(schema).toMatch(/@@unique\(\[tenantId, aadGroupId\]\)/);
    });

    it('the evaluator picks highest priority then role severity', () => {
        expect(exists('src/app-layer/services/entra-group-evaluator.ts')).toBe(true);
        const src = read('src/app-layer/services/entra-group-evaluator.ts');
        expect(src).toMatch(/ROLE_SEVERITY/);
        expect(src).toMatch(/enforceGroupGate/);
        expect(src).toMatch(/b\.priority - a\.priority/);
    });

    it('the mapper enforces the no-override invariant on manual memberships', () => {
        const src = read('src/app-layer/services/entra-group-mapper.ts');
        // the guard: a non-Entra-provisioned membership short-circuits
        expect(src).toMatch(/!existing\.provisionedByEntraGroup/);
        expect(src).toMatch(/skipped_manual/);
        // and a freshly-created one is marked auto-managed
        expect(src).toMatch(/provisionedByEntraGroup: true/);
    });

    it('auth.ts reconciles the role at sign-in and on refresh', () => {
        const src = read('src/auth.ts');
        expect(src).toMatch(/applyEntraGroupMapping/);
        expect(src).toMatch(/'claim'/);
        expect(src).toMatch(/'refresh'/);
    });

    it('the admin CRUD route is permission-gated', () => {
        expect(read('src/app/api/t/[tenantSlug]/admin/entra-groups/route.ts')).toMatch(
            /requirePermission\('admin\.manage'/,
        );
    });
});
