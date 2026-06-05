/**
 * Integration tests for the risk + asset attached-evidence backend.
 *
 * Proves, against a real DB, that a risk and an asset can attach
 * evidence the same way a control/task can: link a URL → LINK Evidence
 * row tagged with the entity; list via the `{ links, evidence }` shape
 * the shared <EvidenceSubTable> renders; unlink detaches (clears the FK)
 * without deleting the row; and tenant isolation holds.
 */
import { PrismaClient, Role, MembershipStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { hashForLookup } from '@/lib/security/encryption';
import { makeRequestContext } from '../helpers/make-context';
import {
    getRiskEvidenceTab,
    linkRiskEvidence,
    unlinkRiskEvidence,
} from '@/app-layer/usecases/risk';
import {
    getAssetEvidenceTab,
    linkAssetEvidence,
    unlinkAssetEvidence,
} from '@/app-layer/usecases/asset';

const globalPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});
const describeFn = DB_AVAILABLE ? describe : describe.skip;
jest.setTimeout(30_000);

const TAG = `rae-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${TAG}`;
const FOREIGN_TENANT_ID = `t-${TAG}-other`;

let admin: { userId: string };
let RISK_ID = '';
let ASSET_ID = '';
let FOREIGN_RISK_ID = '';

async function makeUser(label: string): Promise<{ userId: string }> {
    const email = `${TAG}-${label}@example.test`;
    const u = await globalPrisma.user.create({
        data: { email, emailHash: hashForLookup(email) },
    });
    return { userId: u.id };
}

beforeAll(async () => {
    if (!DB_AVAILABLE) return;
    for (const [id, slug] of [
        [TENANT_ID, TAG],
        [FOREIGN_TENANT_ID, `${TAG}-other`],
    ]) {
        await globalPrisma.tenant.upsert({
            where: { id },
            update: {},
            create: { id, name: `t ${slug}`, slug },
        });
    }
    admin = await makeUser('admin');
    await globalPrisma.tenantMembership.create({
        data: {
            tenantId: TENANT_ID,
            userId: admin.userId,
            role: Role.ADMIN,
            status: MembershipStatus.ACTIVE,
        },
    });
    const risk = await globalPrisma.risk.create({
        data: { tenantId: TENANT_ID, title: 'Risk with evidence' },
    });
    RISK_ID = risk.id;
    const asset = await globalPrisma.asset.create({
        data: { tenantId: TENANT_ID, name: 'Asset with evidence', type: 'SYSTEM' },
    });
    ASSET_ID = asset.id;
    const foreignRisk = await globalPrisma.risk.create({
        data: { tenantId: FOREIGN_TENANT_ID, title: 'Foreign risk' },
    });
    FOREIGN_RISK_ID = foreignRisk.id;
});

afterAll(async () => {
    if (!DB_AVAILABLE) {
        await globalPrisma.$disconnect();
        return;
    }
    const tenants = { tenantId: { in: [TENANT_ID, FOREIGN_TENANT_ID] } };
    try { await globalPrisma.auditLog.deleteMany({ where: tenants }); } catch { /* best effort */ }
    try { await globalPrisma.evidence.deleteMany({ where: tenants }); } catch { /* best effort */ }
    try { await globalPrisma.risk.deleteMany({ where: tenants }); } catch { /* best effort */ }
    try { await globalPrisma.asset.deleteMany({ where: tenants }); } catch { /* best effort */ }
    try { await globalPrisma.tenantMembership.deleteMany({ where: tenants }); } catch { /* best effort */ }
    try { await globalPrisma.user.deleteMany({ where: { id: admin.userId } }); } catch { /* best effort */ }
    try { await globalPrisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, FOREIGN_TENANT_ID] } } }); } catch { /* best effort */ }
    await globalPrisma.$disconnect();
});

function adminCtx() {
    return makeRequestContext('ADMIN', { tenantId: TENANT_ID, userId: admin.userId, tenantSlug: TAG });
}

describeFn('risk evidence usecases (integration)', () => {
    it('linkRiskEvidence creates a LINK evidence row tagged with the risk', async () => {
        const ev = await linkRiskEvidence(adminCtx(), RISK_ID, { url: 'https://example.com/risk-doc', note: 'Doc' });
        expect(ev.type).toBe('LINK');
        expect(ev.riskId).toBe(RISK_ID);
        expect(ev.content).toBe('https://example.com/risk-doc');
    });

    it('getRiskEvidenceTab returns it; unlink detaches but keeps the row', async () => {
        const ev = await linkRiskEvidence(adminCtx(), RISK_ID, { url: 'https://example.com/r2' });
        const tab = await getRiskEvidenceTab(adminCtx(), RISK_ID);
        expect(tab.links).toEqual([]);
        expect(tab.evidence.some((e) => e.id === ev.id)).toBe(true);
        await unlinkRiskEvidence(adminCtx(), RISK_ID, ev.id);
        const still = await globalPrisma.evidence.findUnique({ where: { id: ev.id } });
        expect(still).not.toBeNull();
        expect(still?.riskId).toBeNull();
    });

    it('is tenant-isolated — a foreign risk id is not found', async () => {
        await expect(getRiskEvidenceTab(adminCtx(), FOREIGN_RISK_ID)).rejects.toThrow();
        await expect(linkRiskEvidence(adminCtx(), FOREIGN_RISK_ID, { url: 'https://example.com/x' })).rejects.toThrow();
    });
});

describeFn('asset evidence usecases (integration)', () => {
    it('linkAssetEvidence creates a LINK evidence row tagged with the asset', async () => {
        const ev = await linkAssetEvidence(adminCtx(), ASSET_ID, { url: 'https://example.com/asset-doc' });
        expect(ev.type).toBe('LINK');
        expect(ev.assetId).toBe(ASSET_ID);
    });

    it('getAssetEvidenceTab returns it; unlink detaches but keeps the row', async () => {
        const ev = await linkAssetEvidence(adminCtx(), ASSET_ID, { url: 'https://example.com/a2' });
        const tab = await getAssetEvidenceTab(adminCtx(), ASSET_ID);
        expect(tab.evidence.some((e) => e.id === ev.id)).toBe(true);
        await unlinkAssetEvidence(adminCtx(), ASSET_ID, ev.id);
        const still = await globalPrisma.evidence.findUnique({ where: { id: ev.id } });
        expect(still?.assetId).toBeNull();
    });
});
