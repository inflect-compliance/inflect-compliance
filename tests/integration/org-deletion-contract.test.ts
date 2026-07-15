/**
 * Org deletion contract — DB-backed regression test.
 *
 * Locks the FK cascade semantics of `Organization` hard-delete so
 * that any future "tidy up the cascade" PR surfaces the intent for
 * review rather than silently flipping behaviour.
 *
 * Hard-delete is the only deletion path the schema supports — there
 * is no `Organization.deletedAt`. This is a deliberate decision; see
 * docs/implementation-notes/2026-04-27-organization-soft-delete-decision.md
 * for the rationale and the trigger conditions for revisiting.
 *
 * Contract proven here:
 *
 *   1. `Tenant.organizationId` → ON DELETE SET NULL.
 *      Removing an org orphans its tenants but preserves them — they
 *      revert to legacy pre-org behaviour. Slug, name, child data,
 *      tenant memberships are all intact.
 *
 *   2. `OrgMembership` → ON DELETE CASCADE.
 *      Membership rows are derivative; they don't survive their
 *      parent. The audit trail of who-was-in-what-org-when lives in
 *      `AuditLog`, not in this table.
 *
 *   3. `TenantMembership.provisionedByOrgId` → ON DELETE SET NULL.
 *      Auto-provisioned ADMIN memberships outlive the org so the
 *      user retains tenant-level read access. Only the back-link is
 *      cleared; role and tenantId are unchanged.
 *
 * If a future migration changes any of these to a different
 * `onDelete` mode, this test fails with a clear diff between
 * intended and observed behaviour. That's the point — the change
 * may be correct, but it must be a deliberate decision.
 *
 * Gated by DB_AVAILABLE — skips locally without Postgres + migrations
 * applied; runs in CI.
 */
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import type { PrismaClient } from '@prisma/client';
import { generateAndWrapDek } from '@/lib/security/tenant-keys';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Organization deletion contract — FK cascade behaviour', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('hard-deleting an Organization sets Tenant.organizationId to NULL (tenant survives)', async () => {
        const uniq = `del-tenant-${Date.now()}`;
        const org = await prisma.organization.create({
            data: { name: `${uniq} corp`, slug: `${uniq}-org` },
        });
        const { wrapped } = generateAndWrapDek();
        const tenant = await prisma.tenant.create({
            data: {
                name: `${uniq} tenant`,
                slug: `${uniq}-tenant`,
                organizationId: org.id,
                encryptedDek: wrapped,
            },
        });

        await prisma.organization.delete({ where: { id: org.id } });

        const after = await prisma.tenant.findUnique({
            where: { id: tenant.id },
            select: { id: true, slug: true, organizationId: true },
        });
        try {
            expect(after).not.toBeNull();
            expect(after!.id).toBe(tenant.id);
            expect(after!.slug).toBe(`${uniq}-tenant`);
            // The load-bearing assertion — SET NULL, not CASCADE.
            expect(after!.organizationId).toBeNull();
        } finally {
            await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
        }
    });

    it('hard-deleting an Organization cascades into OrgMembership rows', async () => {
        const uniq = `del-mem-${Date.now()}`;
        const user = await prisma.user.create({
            data: { email: `${uniq}@example.com`, name: 'Test' },
        });
        const org = await prisma.organization.create({
            data: { name: `${uniq} corp`, slug: `${uniq}-org` },
        });
        const membership = await prisma.orgMembership.create({
            data: { organizationId: org.id, userId: user.id, role: 'ORG_ADMIN' },
        });

        await prisma.organization.delete({ where: { id: org.id } });

        const after = await prisma.orgMembership.findUnique({
            where: { id: membership.id },
        });
        try {
            // Cascade — the row is gone with its parent.
            expect(after).toBeNull();

            // The user survives — global identity is independent of
            // org lifecycle.
            const userAfter = await prisma.user.findUnique({
                where: { id: user.id },
            });
            expect(userAfter).not.toBeNull();
        } finally {
            await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
        }
    });

    it('hard-deleting an Organization sets TenantMembership.provisionedByOrgId to NULL (auditor membership survives)', async () => {
        const uniq = `del-prov-${Date.now()}`;
        const user = await prisma.user.create({
            data: { email: `${uniq}@example.com`, name: 'Test' },
        });
        const org = await prisma.organization.create({
            data: { name: `${uniq} corp`, slug: `${uniq}-org` },
        });
        const { wrapped } = generateAndWrapDek();
        const tenant = await prisma.tenant.create({
            data: {
                name: `${uniq} tenant`,
                slug: `${uniq}-tenant`,
                organizationId: org.id,
                encryptedDek: wrapped,
            },
        });
        const tm = await prisma.tenantMembership.create({
            data: {
                tenantId: tenant.id,
                userId: user.id,
                role: 'ADMIN',
                provisionedByOrgId: org.id,
            },
        });

        await prisma.organization.delete({ where: { id: org.id } });

        const after = await prisma.tenantMembership.findUnique({
            where: { id: tm.id },
            select: {
                id: true,
                tenantId: true,
                userId: true,
                role: true,
                provisionedByOrgId: true,
            },
        });
        try {
            // Auto-provisioned ADMIN membership survives — the
            // user keeps tenant read access. Only the back-link
            // clears.
            expect(after).not.toBeNull();
            expect(after!.tenantId).toBe(tenant.id);
            expect(after!.userId).toBe(user.id);
            expect(after!.role).toBe('ADMIN');
            expect(after!.provisionedByOrgId).toBeNull();
        } finally {
            await prisma.tenantMembership.delete({ where: { id: tm.id } }).catch(() => {});
            await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
            await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
        }
    });

    // ─── Append-only contract ─────────────────────────────────────

    it('Organization has no deletedAt column — hard-delete is the only deletion path', async () => {
        // Reflective check — locks the decision in
        // docs/implementation-notes/2026-04-27-organization-soft-delete-decision.md.
        // If a future schema migration adds Organization.deletedAt
        // without revisiting that decision (and without the matching
        // soft-delete framework: deletedByUserId, retentionUntil,
        // sweep job, restore usecase, RLS update), this assertion
        // fails and the conversation lands at the right level.
        const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'Organization'
        `);
        const colNames = new Set(cols.map((c) => c.column_name));
        expect(colNames.has('deletedAt')).toBe(false);
    });
});
