/**
 * H5 — Device RLS behavioural proof (two-tenant, live Postgres).
 *
 * `rls-coverage.test.ts` confirms the canonical policies EXIST on `Device`;
 * this exercises the actual semantics against a real DB so a future migration
 * that quietly weakens them breaks here even if the static surface still reads
 * as correct. Device is the PR-5 endpoint-inventory table written by the
 * token-authed agent report — cross-tenant leakage here is a direct data-
 * confidentiality break.
 *
 * Coverage: own-tenant INSERT succeeds; foreign-tenant INSERT is blocked by
 * WITH CHECK; SELECT under tenant A cannot see tenant B's devices.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { withTenantDb } from '@/lib/db-context';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';

const globalPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const TAG = `dev-${randomUUID().slice(0, 8)}`;
const TENANT_A = `t-${TAG}-a`;
const TENANT_B = `t-${TAG}-b`;

async function seed() {
    for (const id of [TENANT_A, TENANT_B]) {
        await globalPrisma.tenant.upsert({ where: { id }, update: {}, create: { id, name: id, slug: id } });
    }
}

async function insertDevice(tenantId: string, serial: string) {
    return withTenantDb(tenantId, async (tx) =>
        tx.device.create({ data: { tenantId, serialNumber: serial, platform: 'MACOS', source: 'AGENT' }, select: { id: true } }),
    );
}

describeFn('Device — RLS isolation (H5)', () => {
    beforeAll(async () => { await seed(); });
    afterAll(async () => {
        await globalPrisma.device.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
        await globalPrisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
        await globalPrisma.$disconnect();
    });

    it('own-tenant INSERT succeeds', async () => {
        const d = await insertDevice(TENANT_A, `${TAG}-SN-A`);
        expect(d.id).toBeTruthy();
    });

    it('foreign-tenant INSERT is blocked by WITH CHECK', async () => {
        await expect(
            withTenantDb(TENANT_A, async (tx) =>
                tx.device.create({ data: { tenantId: TENANT_B, serialNumber: `${TAG}-SN-X`, platform: 'MACOS', source: 'AGENT' } }),
            ),
        ).rejects.toThrow(/row-level security|new row violates/i);
    });

    it('SELECT under tenant A cannot see tenant B devices', async () => {
        await insertDevice(TENANT_B, `${TAG}-SN-B`);
        const aVisible = await withTenantDb(TENANT_A, async (tx) => tx.device.findMany({ select: { tenantId: true } }));
        expect(aVisible.every((d) => d.tenantId === TENANT_A)).toBe(true);
        expect(aVisible.some((d) => d.tenantId === TENANT_B)).toBe(false);
    });
});
