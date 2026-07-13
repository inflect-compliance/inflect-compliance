/**
 * Integration coverage for FrameworkRepository
 * (`src/app-layer/repositories/FrameworkRepository.ts`).
 *
 * NOTE ON RLS: Framework / FrameworkRequirement / FrameworkPack /
 * ControlTemplate are GLOBAL shared-catalog tables — they carry no
 * `tenantId` and have NO row-level security (verified against the
 * live schema: relrowsecurity = false). So there is no cross-tenant
 * RLS-rejection test for this repo. The tenant-scoped boundary the
 * repo DOES enforce lives in `getCoverage` / `isPackInstalled`, which
 * filter the mappings/controls by tenantId — both are tested
 * here for the own-tenant-only behaviour.
 *
 * Methods covered: listFrameworks, getFrameworkByKey (found + the
 * implicit not-found null), listRequirements (found + not-found null
 * branch), getPackByKey, getCoverage (found + not-found null + the
 * mapped/unmapped partition + percent math), isPackInstalled
 * (no-pack branch, no-templates branch, controls-present branch,
 * controls-absent branch).
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { DB_AVAILABLE } from '../db-helper';
import { prismaTestClient } from '../../helpers/db';
import { FrameworkRepository } from '@/app-layer/repositories/FrameworkRepository';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE = `fw-${randomUUID().slice(0, 8)}`;
const FW_KEY = `${SUITE}-iso`;
const PACK_KEY = `${SUITE}-pack`;
const EMPTY_PACK_KEY = `${SUITE}-emptypack`;
const TPL_CODE = `${SUITE}-TPL-1`;
const TENANT_A = `t-${SUITE}-a`;
const TENANT_B = `t-${SUITE}-b`;

describeFn('FrameworkRepository (integration — real DB, global catalog)', () => {
    let prisma: PrismaClient;
    let frameworkId = '';
    let req1Id = '';
    let req2Id = '';
    let controlAId = '';

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();

        for (const id of [TENANT_A, TENANT_B]) {
            await prisma.tenant.upsert({
                where: { id },
                update: {},
                create: { id, name: id, slug: id },
            });
        }

        const fw = await prisma.framework.create({
            data: { key: FW_KEY, name: 'Test ISO', kind: 'ISO_STANDARD' },
        });
        frameworkId = fw.id;

        const r1 = await prisma.frameworkRequirement.create({
            data: { frameworkId, code: 'A.1', title: 'Req One', sortOrder: 1, theme: 'T', themeNumber: 1 },
        });
        req1Id = r1.id;
        const r2 = await prisma.frameworkRequirement.create({
            data: { frameworkId, code: 'A.2', title: 'Req Two', sortOrder: 2 },
        });
        req2Id = r2.id;

        // A control template + pack linking it.
        const tpl = await prisma.controlTemplate.create({
            data: { code: TPL_CODE, title: 'Template One' },
        });
        const pack = await prisma.frameworkPack.create({
            data: { key: PACK_KEY, name: 'Test Pack', frameworkId },
        });
        await prisma.packTemplateLink.create({
            data: { packId: pack.id, templateId: tpl.id },
        });
        // A pack with no template links (isPackInstalled no-templates branch).
        await prisma.frameworkPack.create({
            data: { key: EMPTY_PACK_KEY, name: 'Empty Pack', frameworkId },
        });

        // TENANT_A has a control whose code matches the pack template +
        // a mapping req1 → that control. TENANT_B has neither.
        const ctrl = await prisma.control.create({
            data: { tenantId: TENANT_A, code: TPL_CODE, name: 'Implemented Control' },
        });
        controlAId = ctrl.id;
        // getCoverage reads the canonical controlRequirementLink table.
        await prisma.controlRequirementLink.create({
            data: { tenantId: TENANT_A, controlId: controlAId, requirementId: req1Id },
        });
    });

    afterAll(async () => {
        await prisma.controlRequirementLink.deleteMany({ where: { requirementId: { in: [req1Id, req2Id] } } });
        await prisma.control.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
        await prisma.packTemplateLink.deleteMany({ where: { pack: { frameworkId } } });
        await prisma.frameworkPack.deleteMany({ where: { frameworkId } });
        await prisma.controlTemplate.deleteMany({ where: { code: TPL_CODE } });
        await prisma.frameworkRequirement.deleteMany({ where: { frameworkId } });
        await prisma.framework.deleteMany({ where: { id: frameworkId } });
        await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
        await prisma.$disconnect();
    });

    it('listFrameworks includes our seeded framework with requirement count + packs', async () => {
        const all = await FrameworkRepository.listFrameworks(prisma);
        const ours = all.find((f) => f.key === FW_KEY);
        expect(ours).toBeDefined();
        expect(ours?._count.requirements).toBe(2);
        expect(ours?.packs.map((p) => p.key).sort()).toEqual([EMPTY_PACK_KEY, PACK_KEY].sort());
    });

    it('getFrameworkByKey returns the framework with ordered requirements (and null for unknown)', async () => {
        const fw = await FrameworkRepository.getFrameworkByKey(prisma, FW_KEY);
        expect(fw?.id).toBe(frameworkId);
        expect(fw?.requirements.map((r) => r.code)).toEqual(['A.1', 'A.2']);

        expect(await FrameworkRepository.getFrameworkByKey(prisma, 'does-not-exist')).toBeNull();
    });

    it('listRequirements returns ordered requirements, or null for an unknown framework', async () => {
        const reqs = await FrameworkRepository.listRequirements(prisma, FW_KEY);
        expect(reqs?.map((r) => r.code)).toEqual(['A.1', 'A.2']);
        // not-found branch
        expect(await FrameworkRepository.listRequirements(prisma, 'nope')).toBeNull();
    });

    it('getPackByKey returns the pack with framework + template links', async () => {
        const pack = await FrameworkRepository.getPackByKey(prisma, PACK_KEY);
        expect(pack?.key).toBe(PACK_KEY);
        expect(pack?.framework.id).toBe(frameworkId);
        expect(pack?.templateLinks).toHaveLength(1);
        expect(pack?.templateLinks[0].template.code).toBe(TPL_CODE);
    });

    it('getCoverage partitions mapped/unmapped per tenant and computes percent', async () => {
        // TENANT_A has req1 mapped (50%).
        const covA = await FrameworkRepository.getCoverage(prisma, FW_KEY, TENANT_A);
        expect(covA?.total).toBe(2);
        expect(covA?.mappedCount).toBe(1);
        expect(covA?.unmappedCount).toBe(1);
        expect(covA?.coveragePercent).toBe(50);
        expect(covA?.mapped.map((r) => r.id)).toEqual([req1Id]);

        // TENANT_B has no mappings (0%).
        const covB = await FrameworkRepository.getCoverage(prisma, FW_KEY, TENANT_B);
        expect(covB?.mappedCount).toBe(0);
        expect(covB?.coveragePercent).toBe(0);

        // Unknown framework → null branch.
        expect(await FrameworkRepository.getCoverage(prisma, 'nope', TENANT_A)).toBeNull();
    });

    it('isPackInstalled reflects whether tenant controls match pack templates', async () => {
        // TENANT_A has a control with the pack template's code → installed.
        expect(await FrameworkRepository.isPackInstalled(prisma, PACK_KEY, TENANT_A)).toBe(true);
        // TENANT_B has no matching control → not installed.
        expect(await FrameworkRepository.isPackInstalled(prisma, PACK_KEY, TENANT_B)).toBe(false);
        // Unknown pack → false (no-pack branch).
        expect(await FrameworkRepository.isPackInstalled(prisma, 'nope', TENANT_A)).toBe(false);
        // Pack with zero templates → false (no-templates branch).
        expect(await FrameworkRepository.isPackInstalled(prisma, EMPTY_PACK_KEY, TENANT_A)).toBe(false);
    });
});
