/**
 * Integration coverage for OnboardingRepository
 * (`src/app-layer/repositories/OnboardingRepository.ts`).
 *
 * Operates over the RLS-protected `TenantOnboarding` table (one row
 * per tenant, `tenantId` unique). Each public method gets a happy-path
 * exercise via prismaTestClient + an RLS-rejection block that mirrors
 * `tests/integration/access-review-rls.test.ts`.
 *
 * Public methods covered: getByTenantId, upsertInitial, start,
 * saveStepData (existing-data merge branch + no-existing branch),
 * completeStep (already-includes branch + append branch), finish, reset.
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { DB_AVAILABLE } from '../db-helper';
import { prismaTestClient } from '../../helpers/db';
import { withTenantDb } from '@/lib/db-context';
import { makeRequestContext } from '../../helpers/make-context';
import { OnboardingRepository } from '@/app-layer/repositories/OnboardingRepository';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE = `onb-${randomUUID().slice(0, 8)}`;
const TENANT_A = `t-${SUITE}-a`;
const TENANT_B = `t-${SUITE}-b`;
const CTX_A = makeRequestContext('ADMIN', { tenantId: TENANT_A });

describeFn('OnboardingRepository (integration — real DB)', () => {
    let prisma: PrismaClient;

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
    });

    afterAll(async () => {
        await prisma.tenantOnboarding.deleteMany({
            where: { tenantId: { in: [TENANT_A, TENANT_B] } },
        });
        await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
        await prisma.$disconnect();
    });

    afterEach(async () => {
        await prisma.tenantOnboarding.deleteMany({
            where: { tenantId: { in: [TENANT_A, TENANT_B] } },
        });
    });

    it('upsertInitial creates a NOT_STARTED row; getByTenantId reads it back', async () => {
        const created = await OnboardingRepository.upsertInitial(prisma, CTX_A);
        expect(created.tenantId).toBe(TENANT_A);
        expect(created.status).toBe('NOT_STARTED');

        const fetched = await OnboardingRepository.getByTenantId(prisma, CTX_A);
        expect(fetched?.tenantId).toBe(TENANT_A);

        // upsertInitial again is idempotent (update branch = {}).
        const again = await OnboardingRepository.upsertInitial(prisma, CTX_A);
        expect(again.id).toBe(created.id);
    });

    it('start sets IN_PROGRESS + startedAt (create then update branch)', async () => {
        const started = await OnboardingRepository.start(prisma, CTX_A);
        expect(started.status).toBe('IN_PROGRESS');
        expect(started.startedAt).not.toBeNull();

        // Calling start again hits the upsert update branch.
        const restarted = await OnboardingRepository.start(prisma, CTX_A);
        expect(restarted.status).toBe('IN_PROGRESS');
    });

    it('saveStepData merges into existing stepData', async () => {
        await OnboardingRepository.upsertInitial(prisma, CTX_A);
        const first = await OnboardingRepository.saveStepData(prisma, CTX_A, 'COMPANY_PROFILE', { name: 'Acme' });
        expect(first.stepData).toEqual({ COMPANY_PROFILE: { name: 'Acme' } });

        // A second save merges with the prior step (currentData spread branch).
        const second = await OnboardingRepository.saveStepData(prisma, CTX_A, 'FRAMEWORK', { key: 'ISO27001' });
        expect(second.stepData).toEqual({
            COMPANY_PROFILE: { name: 'Acme' },
            FRAMEWORK: { key: 'ISO27001' },
        });
    });

    it('completeStep appends a step then is idempotent for the same step', async () => {
        await OnboardingRepository.upsertInitial(prisma, CTX_A);
        const afterFirst = await OnboardingRepository.completeStep(prisma, CTX_A, 'COMPANY_PROFILE', 'FRAMEWORK');
        expect(afterFirst.completedSteps).toEqual(['COMPANY_PROFILE']);
        expect(afterFirst.currentStep).toBe('FRAMEWORK');

        // Completing the same step again does NOT duplicate it (includes branch).
        const afterDup = await OnboardingRepository.completeStep(prisma, CTX_A, 'COMPANY_PROFILE', 'CONTROLS');
        expect(afterDup.completedSteps).toEqual(['COMPANY_PROFILE']);
        expect(afterDup.currentStep).toBe('CONTROLS');

        // A different step appends (the [...prev, step] branch).
        const afterSecond = await OnboardingRepository.completeStep(prisma, CTX_A, 'FRAMEWORK', 'DONE');
        expect(afterSecond.completedSteps).toEqual(['COMPANY_PROFILE', 'FRAMEWORK']);
    });

    it('finish marks COMPLETED with completedAt; reset returns to NOT_STARTED', async () => {
        await OnboardingRepository.start(prisma, CTX_A);
        const finished = await OnboardingRepository.finish(prisma, CTX_A);
        expect(finished.status).toBe('COMPLETED');
        expect(finished.completedAt).not.toBeNull();

        const reset = await OnboardingRepository.reset(prisma, CTX_A);
        expect(reset.status).toBe('NOT_STARTED');
        expect(reset.currentStep).toBe('COMPANY_PROFILE');
        expect(reset.completedSteps).toEqual([]);
        expect(reset.startedAt).toBeNull();
        expect(reset.completedAt).toBeNull();
    });

    it('reset creates the row when none exists (upsert create branch)', async () => {
        // No prior row for TENANT_A.
        const reset = await OnboardingRepository.reset(prisma, CTX_A);
        expect(reset.tenantId).toBe(TENANT_A);
        expect(reset.status).toBe('NOT_STARTED');
    });

    // ── RLS isolation ────────────────────────────────────────────────

    it('app_user INSERT with own tenantId succeeds; foreign tenantId blocked', async () => {
        const id = await withTenantDb(TENANT_A, async (tx) => {
            const row = await tx.tenantOnboarding.create({ data: { tenantId: TENANT_A } });
            return row.id;
        }, prisma);
        expect(await prisma.tenantOnboarding.findUnique({ where: { id } })).not.toBeNull();

        await expect(
            withTenantDb(TENANT_A, async (tx) => {
                await tx.tenantOnboarding.create({ data: { tenantId: TENANT_B } });
            }, prisma),
        ).rejects.toThrow(/row-level security|new row violates|insert or update/i);
    });

    it('app_user SELECT only sees own-tenant onboarding rows', async () => {
        await prisma.tenantOnboarding.create({ data: { tenantId: TENANT_A } });
        await prisma.tenantOnboarding.create({ data: { tenantId: TENANT_B } });

        const visibleToA = await withTenantDb(TENANT_A, async (tx) => {
            return tx.tenantOnboarding.findMany({
                where: { tenantId: { in: [TENANT_A, TENANT_B] } },
                select: { tenantId: true },
            });
        }, prisma);
        const tenantIds = new Set(visibleToA.map((r) => r.tenantId));
        expect(tenantIds.has(TENANT_A)).toBe(true);
        expect(tenantIds.has(TENANT_B)).toBe(false);
    });
});
