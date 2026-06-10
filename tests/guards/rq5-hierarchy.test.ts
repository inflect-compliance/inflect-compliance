/**
 * RQ-5 ratchet — risk hierarchy stays wired: two models + migration (RLS),
 * the pure recursive roll-up + CRUD/aggregation service, the routes, and
 * the hierarchy page.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('RQ-5 hierarchy', () => {
    it('schema declares both models + migration with RLS', () => {
        const schema = read('prisma/schema/compliance.prisma');
        expect(schema).toMatch(/model RiskHierarchyNode/);
        expect(schema).toMatch(/model RiskHierarchyLink/);
        const mig = 'prisma/migrations/20260610200000_rq5_hierarchy/migration.sql';
        expect(exists(mig)).toBe(true);
        expect(read(mig)).toMatch(/CREATE POLICY tenant_isolation ON "RiskHierarchyNode"/);
        expect(read(mig)).toMatch(/CREATE POLICY tenant_isolation ON "RiskHierarchyLink"/);
    });

    it('the service exposes the pure roll-up + CRUD + aggregation', () => {
        const src = read('src/app-layer/usecases/risk-hierarchy.ts');
        expect(src).toMatch(/export function aggregateTree/);
        for (const fn of ['createNode', 'updateNode', 'deleteNode', 'getTree', 'linkRisk', 'unlinkRisk', 'aggregateByHierarchy', 'getTreemapData']) {
            expect(src).toContain(`export async function ${fn}`);
        }
        expect(src).toMatch(/resolveALE/);
    });

    it('the routes + hierarchy page exist', () => {
        expect(exists('src/app/api/t/[tenantSlug]/risks/hierarchy/route.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/risks/hierarchy/[nodeId]/route.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/risks/hierarchy/[nodeId]/links/route.ts')).toBe(true);
        expect(exists('src/app/t/[tenantSlug]/(app)/risks/hierarchy/page.tsx')).toBe(true);
    });
});
