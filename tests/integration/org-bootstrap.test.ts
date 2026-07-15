/**
 * Epic O-1 — organization-layer bootstrap integration test.
 *
 * Proves the four invariants the seed (and any future bootstrap path)
 * is required to produce after a clean migrate + seed cycle:
 *
 *   1. Organization exists with the expected slug + name.
 *   2. The acme-corp tenant is linked (Tenant.organizationId = org.id).
 *   3. An OrgMembership exists for the CISO user with role=ORG_ADMIN.
 *   4. Auto-provisioning is tracked correctly: every child tenant has
 *      a TenantMembership for the CISO with role=ADMIN and
 *      provisionedByOrgId pointing at the org.
 *
 * This test does NOT run the seed itself (it constructs an isolated
 * test fixture under unique slugs to stay independent of the dev DB
 * state). It exercises the same shape the seed produces, so a future
 * schema-level change to either side breaks here first.
 *
 * Gated by DB_AVAILABLE — skips locally without a live Postgres + the
 * migrations applied; runs in CI.
 */
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import type { PrismaClient } from '@prisma/client';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Epic O-1 — organization-layer bootstrap state', () => {
    let prisma: PrismaClient;
    const uniq = `o1-bootstrap-${Date.now()}`;
    const orgSlug = `${uniq}-org`;
    const tenantSlug = `${uniq}-tenant`;
    const cisoEmail = `${uniq}-ciso@example.com`;
    let orgId = '';
    let tenantId = '';
    let cisoUserId = '';

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();

        // Mirror the seed's bootstrap sequence on isolated fixtures.
        const org = await prisma.organization.create({
            data: { name: `${uniq} corp`, slug: orgSlug },
        });
        orgId = org.id;

        const tenant = await prisma.tenant.create({
            data: {
                name: `${uniq} solution`,
                slug: tenantSlug,
                organizationId: org.id,
            },
        });
        tenantId = tenant.id;

        const ciso = await prisma.user.create({
            data: {
                email: cisoEmail,
                name: 'Test CISO',
                passwordHash: null,
            },
        });
        cisoUserId = ciso.id;

        await prisma.orgMembership.create({
            data: {
                organizationId: org.id,
                userId: ciso.id,
                role: 'ORG_ADMIN',
            },
        });

        // Auto-provisioned ADMIN (the seed's equivalent inline fan-out).
        await prisma.tenantMembership.create({
            data: {
                tenantId: tenant.id,
                userId: ciso.id,
                role: 'ADMIN',
                provisionedByOrgId: org.id,
            },
        });
    });

    afterAll(async () => {
        // Tear down in reverse-FK-dependency order. Cascade on FKs would
        // also work for OrgMembership and provisionedByOrg-scoped
        // memberships, but explicit deletes keep the test readable.
        await prisma.tenantMembership.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
        await prisma.orgMembership.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
        await prisma.user.delete({ where: { id: cisoUserId } }).catch(() => {});
        await prisma.$disconnect();
    });

    // ── Invariant 1 — organization exists ───────────────────────────

    it('Organization row exists with the expected slug + name', async () => {
        const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
        expect(org).not.toBeNull();
        expect(org!.id).toBe(orgId);
        expect(org!.slug).toBe(orgSlug);
        expect(org!.name).toBe(`${uniq} corp`);
    });

    // ── Invariant 2 — tenant is linked ──────────────────────────────

    it('Tenant.organizationId points at the bootstrap org', async () => {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { organizationId: true, slug: true },
        });
        expect(tenant).not.toBeNull();
        expect(tenant!.organizationId).toBe(orgId);
        expect(tenant!.slug).toBe(tenantSlug);
    });

    it('Organization.tenants relation resolves to the linked tenant', async () => {
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { tenants: { select: { id: true, slug: true } } },
        });
        expect(org).not.toBeNull();
        expect(org!.tenants.map((t) => t.id)).toContain(tenantId);
    });

    // ── Invariant 3 — org membership exists ─────────────────────────

    it('OrgMembership row exists with role=ORG_ADMIN', async () => {
        const membership = await prisma.orgMembership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: orgId,
                    userId: cisoUserId,
                },
            },
        });
        expect(membership).not.toBeNull();
        expect(membership!.role).toBe('ORG_ADMIN');
    });

    // ── Invariant 4 — provisioned membership tracking ───────────────

    it('every child tenant has an ADMIN membership for the CISO with provisionedByOrgId set', async () => {
        const orgTenants = await prisma.tenant.findMany({
            where: { organizationId: orgId },
            select: { id: true },
        });
        // The fixture has one tenant; ensure the count is non-zero so
        // future "I added a second tenant" expansions don't make the
        // assertion vacuous.
        expect(orgTenants.length).toBeGreaterThan(0);

        for (const t of orgTenants) {
            const m = await prisma.tenantMembership.findUnique({
                where: {
                    tenantId_userId: { tenantId: t.id, userId: cisoUserId },
                },
            });
            expect(m).not.toBeNull();
            expect(m!.role).toBe('ADMIN');
            expect(m!.provisionedByOrgId).toBe(orgId);
        }
    });

    it('manually-created memberships are distinguishable from provisioned ones', async () => {
        // Defence-in-depth: simulate a manually-granted membership
        // alongside the auto-provisioned one. The deprovision usecase
        // (Epic O-2) will rely on `provisionedByOrgId IS NOT NULL` to
        // decide what to delete; this test asserts that boolean
        // distinction holds at the DB level.
        const manualUser = await prisma.user.create({
            data: { email: `${uniq}-manual@example.com`, name: 'Manual ADMIN' },
        });
        try {
            const manualMembership = await prisma.tenantMembership.create({
                data: {
                    tenantId,
                    userId: manualUser.id,
                    role: 'ADMIN',
                    // provisionedByOrgId intentionally left NULL.
                },
            });
            expect(manualMembership.provisionedByOrgId).toBeNull();

            // Cross-check: the auto-provisioned CISO row still has the
            // org id, the manual one does not, so a query keyed on
            // `provisionedByOrgId = orgId` deletes only the CISO row.
            const provisioned = await prisma.tenantMembership.findMany({
                where: { tenantId, provisionedByOrgId: orgId },
                select: { userId: true },
            });
            expect(provisioned.map((p) => p.userId)).toEqual([cisoUserId]);
            expect(provisioned.map((p) => p.userId)).not.toContain(manualUser.id);
        } finally {
            await prisma.tenantMembership.deleteMany({ where: { userId: manualUser.id } }).catch(() => {});
            await prisma.user.delete({ where: { id: manualUser.id } }).catch(() => {});
        }
    });

    // ── Schema-coherence cross-checks ───────────────────────────────

    it('OrgMembership unique constraint rejects a duplicate (organizationId, userId)', async () => {
        await expect(
            prisma.orgMembership.create({
                data: {
                    organizationId: orgId,
                    userId: cisoUserId,
                    role: 'ORG_READER', // role differs but the (org, user) tuple is taken
                },
            }),
        ).rejects.toThrow();
    });

    it('Organization.slug is globally unique across the table', async () => {
        await expect(
            prisma.organization.create({
                data: { name: 'collision', slug: orgSlug },
            }),
        ).rejects.toThrow();
    });
});
