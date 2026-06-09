/**
 * RQ-1 — FAIR derived-field recompute (DB-backed).
 *
 * Verifies that `updateRiskFair` persists the FAIR inputs AND recomputes
 * the stored derived columns (lossEventFrequency, fairAle, fairComputedAt),
 * and that a plain `updateRisk` does NOT spuriously trigger FAIR recompute.
 */
import { PrismaClient, Role, MembershipStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { hashForLookup } from '@/lib/security/encryption';
import { makeRequestContext } from '../helpers/make-context';
import { updateRiskFair, updateRisk } from '@/app-layer/usecases/risk';

const globalPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;
jest.setTimeout(30_000);

const TAG = `fair-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${TAG}`;
let adminId = '';
let ctx: ReturnType<typeof makeRequestContext>;

describeFn('RQ-1 — FAIR recompute (integration)', () => {
    beforeAll(async () => {
        await globalPrisma.tenant.upsert({
            where: { id: TENANT_ID },
            update: {},
            create: { id: TENANT_ID, name: `t ${TAG}`, slug: TAG },
        });
        const email = `${TAG}@example.test`;
        const u = await globalPrisma.user.create({ data: { email, emailHash: hashForLookup(email) } });
        adminId = u.id;
        await globalPrisma.tenantMembership.create({
            data: { tenantId: TENANT_ID, userId: adminId, role: Role.ADMIN, status: MembershipStatus.ACTIVE },
        });
        ctx = makeRequestContext('ADMIN', { userId: adminId, tenantId: TENANT_ID, tenantSlug: TAG });
    });

    afterAll(async () => {
        const t = { tenantId: TENANT_ID };
        try { await globalPrisma.auditLog.deleteMany({ where: t }); } catch { /* best effort */ }
        try { await globalPrisma.risk.deleteMany({ where: t }); } catch { /* best effort */ }
        try { await globalPrisma.tenantMembership.deleteMany({ where: t }); } catch { /* best effort */ }
        try { await globalPrisma.user.deleteMany({ where: { id: adminId } }); } catch { /* best effort */ }
        try { await globalPrisma.tenant.deleteMany({ where: { id: TENANT_ID } }); } catch { /* best effort */ }
        await globalPrisma.$disconnect();
    });

    async function freshRisk(): Promise<string> {
        const r = await globalPrisma.risk.create({ data: { tenantId: TENANT_ID, title: 'FAIR risk' } });
        return r.id;
    }

    it('updateRiskFair persists inputs + recomputes LEF/fairAle', async () => {
        const id = await freshRisk();
        await updateRiskFair(ctx, id, {
            threatEventFrequency: 12,
            vulnerabilityProbability: 0.4,
            primaryLossMagnitude: 150000,
        });
        const r = await globalPrisma.risk.findUniqueOrThrow({ where: { id } });
        expect(r.threatEventFrequency).toBe(12);
        expect(r.lossEventFrequency).toBeCloseTo(4.8, 4); // 12 × 0.4
        expect(r.fairAle).toBeCloseTo(720000, 0); // 4.8 × 150000
        expect(r.fairComputedAt).not.toBeNull();
    });

    it('includes secondary loss when SLEF/SLM are set', async () => {
        const id = await freshRisk();
        await updateRiskFair(ctx, id, {
            threatEventFrequency: 10,
            vulnerabilityProbability: 0.5,
            primaryLossMagnitude: 100000,
            secondaryLossEventFrequency: 0.3,
            secondaryLossMagnitude: 500000,
        });
        const r = await globalPrisma.risk.findUniqueOrThrow({ where: { id } });
        // LEF=5; ALE = 5 × (100000 + 0.3×500000) = 5 × 250000 = 1,250,000
        expect(r.fairAle).toBeCloseTo(1_250_000, 0);
    });

    it('derives TEF/Vuln from sub-factors when the direct value is absent', async () => {
        const id = await freshRisk();
        await updateRiskFair(ctx, id, {
            contactFrequency: 24, probabilityOfAction: 0.5,   // TEF=12
            threatCapability: 8, controlStrength: 2,           // vuln=0.8
            primaryLossMagnitude: 100000,
        });
        const r = await globalPrisma.risk.findUniqueOrThrow({ where: { id } });
        expect(r.lossEventFrequency).toBeCloseTo(9.6, 4); // 12 × 0.8
    });

    it('fairComputedAt advances on a second update', async () => {
        const id = await freshRisk();
        await updateRiskFair(ctx, id, { threatEventFrequency: 5, vulnerabilityProbability: 0.5, primaryLossMagnitude: 1000 });
        const first = (await globalPrisma.risk.findUniqueOrThrow({ where: { id } })).fairComputedAt!;
        await new Promise((r) => setTimeout(r, 5));
        await updateRiskFair(ctx, id, { primaryLossMagnitude: 2000 });
        const second = (await globalPrisma.risk.findUniqueOrThrow({ where: { id } })).fairComputedAt!;
        expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
    });

    it('a plain updateRisk does NOT trigger FAIR recompute (backward compat)', async () => {
        const id = await freshRisk();
        await updateRisk(ctx, id, { title: 'Renamed, no FAIR' });
        const r = await globalPrisma.risk.findUniqueOrThrow({ where: { id } });
        expect(r.fairAle).toBeNull();
        expect(r.lossEventFrequency).toBeNull();
    });
});
