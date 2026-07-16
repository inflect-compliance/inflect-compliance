/**
 * Integration test for per-framework applicability — the nullable override on
 * ControlRequirementLink. A control APPLICABLE globally can be marked N/A for
 * one framework's requirement, and cleared back to inherit. Live Postgres.
 *
 * RUN: npx jest tests/integration/per-framework-applicability.test.ts --runInBand
 */
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { getPermissionsForRole } from '@/lib/permissions';
import type { RequestContext } from '@/app-layer/types';
import { setRequirementLinkApplicability } from '@/app-layer/usecases/control';

const prisma = prismaTestClient();
const describeFn = DB_AVAILABLE ? describe : describe.skip;

function ctxFor(tenantId: string, userId: string): RequestContext {
    return {
        requestId: `pfa-${tenantId}`,
        userId,
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

describeFn('per-framework applicability (integration)', () => {
    const runId = randomUUID().slice(0, 12);
    let ctx: RequestContext;
    let controlId = '';
    let requirementId = '';

    beforeAll(async () => {
        const tenant = await prisma.tenant.create({ data: { name: `pfa-${runId}`, slug: `pfa-${runId}` } });
        const user = await prisma.user.create({ data: { email: `pfa-${runId}@t.com`, name: 'PFA' } });
        ctx = ctxFor(tenant.id, user.id);
        const fw = await prisma.framework.create({ data: { key: `fw-${runId}`, name: 'FW' } });
        const req = await prisma.frameworkRequirement.create({ data: { frameworkId: fw.id, code: 'A.1', title: 'Req' } });
        requirementId = req.id;
        // Control APPLICABLE globally.
        const control = await prisma.control.create({ data: { tenantId: tenant.id, name: 'C', applicability: 'APPLICABLE' } });
        controlId = control.id;
        await prisma.controlRequirementLink.create({ data: { tenantId: tenant.id, controlId, requirementId } });
    });

    afterAll(async () => {
        await prisma.controlRequirementLink.deleteMany({ where: { tenantId: ctx.tenantId } }).catch(() => {});
    });

    it('rejects NOT_APPLICABLE without a justification', async () => {
        await expect(
            setRequirementLinkApplicability(ctx, controlId, requirementId, 'NOT_APPLICABLE', null),
        ).rejects.toThrow(/[Jj]ustification/);
    });

    it('scopes an N/A decision to the framework link (control stays APPLICABLE globally)', async () => {
        await setRequirementLinkApplicability(ctx, controlId, requirementId, 'NOT_APPLICABLE', 'not in scope for this framework');

        const link = await prisma.controlRequirementLink.findFirst({ where: { controlId, requirementId } });
        expect(link?.applicability).toBe('NOT_APPLICABLE');
        expect(link?.applicabilityJustification).toBe('not in scope for this framework');

        // The control's GLOBAL applicability is untouched — the override is
        // framework-scoped, so it can be applicable for other frameworks.
        const control = await prisma.control.findFirst({ where: { id: controlId } });
        expect(control?.applicability).toBe('APPLICABLE');
    });

    it('clears the override (null → inherit) and drops the justification', async () => {
        await setRequirementLinkApplicability(ctx, controlId, requirementId, null, null);
        const link = await prisma.controlRequirementLink.findFirst({ where: { controlId, requirementId } });
        expect(link?.applicability).toBeNull();
        expect(link?.applicabilityJustification).toBeNull();
    });
});
