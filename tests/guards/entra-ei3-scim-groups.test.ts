/**
 * EI-3 ratchet — SCIM Groups push provisioning stays wired to the EI-2 mapper.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('EI-3 SCIM Groups', () => {
    it('ScimGroup model exists with tenant-scoped uniqueness', () => {
        const schema = read('prisma/schema/auth.prisma');
        expect(schema).toMatch(/model ScimGroup/);
        expect(schema).toMatch(/@@unique\(\[tenantId, externalId\]\)/);
    });

    it('the SCIM Groups routes exist (collection + item)', () => {
        expect(exists('src/app/api/scim/v2/Groups/route.ts')).toBe(true);
        expect(exists('src/app/api/scim/v2/Groups/[id]/route.ts')).toBe(true);
        const item = read('src/app/api/scim/v2/Groups/[id]/route.ts');
        for (const verb of ['GET', 'PUT', 'PATCH', 'DELETE']) {
            expect(item).toMatch(new RegExp(`export function ${verb}`));
        }
        expect(item).toMatch(/authenticateScimRequest/);
    });

    it('member changes reconcile through applyEntraGroupMapping with source scim', () => {
        const src = read('src/app-layer/usecases/scim-groups.ts');
        expect(src).toMatch(/applyEntraGroupMapping/);
        expect(src).toMatch(/'scim'/);
        // PatchOp add/remove + displayName handled
        expect(src).toMatch(/op\.op === 'add'/);
        expect(src).toMatch(/op\.op === 'remove'/);
        expect(src).toMatch(/displayname/);
    });
});
