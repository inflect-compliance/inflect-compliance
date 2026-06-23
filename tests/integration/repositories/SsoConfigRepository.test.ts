/**
 * Integration coverage for SsoConfigRepository
 * (`src/app-layer/repositories/SsoConfigRepository.ts`).
 *
 * The repo is a function module over the RLS-protected
 * `TenantIdentityProvider` table. Every public function gets a
 * happy-path exercise (real insert/read via prismaTestClient) and the
 * cross-tenant isolation is locked by an RLS-rejection block that
 * mirrors `tests/integration/access-review-rls.test.ts`:
 *   - own-tenant INSERT under app_user succeeds,
 *   - foreign-tenant INSERT under app_user is blocked,
 *   - app_user SELECT is tenant-scoped.
 *
 * Public functions covered: findByTenantId, findById,
 * findEnabledByTenantId, findByDomain, upsert (create + update
 * branches), setEnabled, setEnforced, remove.
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { DB_AVAILABLE } from '../db-helper';
import { prismaTestClient } from '../../helpers/db';
import { withTenantDb } from '@/lib/db-context';
import * as SsoConfigRepository from '@/app-layer/repositories/SsoConfigRepository';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE = `sso-${randomUUID().slice(0, 8)}`;
const TENANT_A = `t-${SUITE}-a`;
const TENANT_B = `t-${SUITE}-b`;

describeFn('SsoConfigRepository (integration — real DB)', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();
        await prisma.tenant.upsert({
            where: { id: TENANT_A },
            update: {},
            create: { id: TENANT_A, name: `${SUITE}-a`, slug: `${SUITE}-a` },
        });
        await prisma.tenant.upsert({
            where: { id: TENANT_B },
            update: {},
            create: { id: TENANT_B, name: `${SUITE}-b`, slug: `${SUITE}-b` },
        });
    });

    afterAll(async () => {
        await prisma.tenantIdentityProvider.deleteMany({
            where: { tenantId: { in: [TENANT_A, TENANT_B] } },
        });
        await prisma.tenant.deleteMany({
            where: { id: { in: [TENANT_A, TENANT_B] } },
        });
        await prisma.$disconnect();
    });

    afterEach(async () => {
        await prisma.tenantIdentityProvider.deleteMany({
            where: { tenantId: { in: [TENANT_A, TENANT_B] } },
        });
    });

    // ── Happy paths ──────────────────────────────────────────────────

    it('upsert creates a new provider, then updates it (both branches)', async () => {
        const created = await SsoConfigRepository.upsert(TENANT_A, {
            name: 'Acme SAML',
            type: 'SAML',
            emailDomains: ['acme.test'],
        });
        expect(created.tenantId).toBe(TENANT_A);
        expect(created.isEnabled).toBe(false); // default branch
        expect(created.isEnforced).toBe(false);
        expect(created.emailDomains).toEqual(['acme.test']);

        // update branch (id provided)
        const updated = await SsoConfigRepository.upsert(TENANT_A, {
            id: created.id,
            name: 'Acme SAML v2',
            type: 'SAML',
            isEnabled: true,
            configJson: { entryPoint: 'https://idp.acme.test/sso' },
        });
        expect(updated.id).toBe(created.id);
        expect(updated.name).toBe('Acme SAML v2');
        expect(updated.isEnabled).toBe(true);
    });

    it('findByTenantId / findById return own-tenant rows', async () => {
        const a = await SsoConfigRepository.upsert(TENANT_A, { name: 'A1', type: 'OIDC' });
        const all = await SsoConfigRepository.findByTenantId(TENANT_A);
        expect(all.map((r) => r.id)).toContain(a.id);

        const byId = await SsoConfigRepository.findById(TENANT_A, a.id);
        expect(byId?.id).toBe(a.id);

        // findById is tenant-scoped: querying under TENANT_B yields null.
        const wrongTenant = await SsoConfigRepository.findById(TENANT_B, a.id);
        expect(wrongTenant).toBeNull();
    });

    it('findEnabledByTenantId returns only enabled providers', async () => {
        const enabled = await SsoConfigRepository.upsert(TENANT_A, {
            name: 'Enabled', type: 'OIDC', isEnabled: true,
        });
        await SsoConfigRepository.upsert(TENANT_A, {
            name: 'Disabled', type: 'OIDC', isEnabled: false,
        });
        const rows = await SsoConfigRepository.findEnabledByTenantId(TENANT_A);
        expect(rows.map((r) => r.id)).toEqual([enabled.id]);
    });

    it('findByDomain matches an enabled provider claiming a (lowercased) domain', async () => {
        const created = await SsoConfigRepository.upsert(TENANT_A, {
            name: 'Domain', type: 'SAML', isEnabled: true,
            emailDomains: ['corp.test'],
        });
        // Mixed-case input is lowercased before lookup.
        const found = await SsoConfigRepository.findByDomain('CORP.test');
        expect(found?.id).toBe(created.id);

        const miss = await SsoConfigRepository.findByDomain('nope.test');
        expect(miss).toBeNull();
    });

    it('setEnabled / setEnforced flip the flags and return the row', async () => {
        const p = await SsoConfigRepository.upsert(TENANT_A, { name: 'Flags', type: 'OIDC' });
        const en = await SsoConfigRepository.setEnabled(TENANT_A, p.id, true);
        expect(en.isEnabled).toBe(true);
        const enf = await SsoConfigRepository.setEnforced(TENANT_A, p.id, true);
        expect(enf.isEnforced).toBe(true);
    });

    it('remove deletes only the tenant-scoped provider', async () => {
        const p = await SsoConfigRepository.upsert(TENANT_A, { name: 'ToRemove', type: 'OIDC' });
        // Wrong-tenant remove is a no-op (deleteMany where id+tenantId).
        await SsoConfigRepository.remove(TENANT_B, p.id);
        expect(await SsoConfigRepository.findById(TENANT_A, p.id)).not.toBeNull();
        // Correct tenant removes it.
        await SsoConfigRepository.remove(TENANT_A, p.id);
        expect(await SsoConfigRepository.findById(TENANT_A, p.id)).toBeNull();
    });

    // ── RLS isolation (mirrors access-review-rls.test.ts) ────────────

    it('app_user INSERT with own tenantId succeeds; foreign tenantId is blocked', async () => {
        // Own-tenant write under app_user succeeds.
        const id = await withTenantDb(TENANT_A, async (tx) => {
            const row = await tx.tenantIdentityProvider.create({
                data: { tenantId: TENANT_A, name: 'rls-own', type: 'OIDC' },
            });
            return row.id;
        }, prisma);
        expect(await prisma.tenantIdentityProvider.findUnique({ where: { id } })).not.toBeNull();

        // Foreign-tenant write under TENANT_A's app_user is rejected by RLS.
        await expect(
            withTenantDb(TENANT_A, async (tx) => {
                await tx.tenantIdentityProvider.create({
                    data: { tenantId: TENANT_B, name: 'rls-rogue', type: 'OIDC' },
                });
            }, prisma),
        ).rejects.toThrow(/row-level security|new row violates|insert or update/i);
    });

    it('app_user SELECT only sees own-tenant providers', async () => {
        const a = await prisma.tenantIdentityProvider.create({
            data: { tenantId: TENANT_A, name: 'visible-a', type: 'OIDC' },
        });
        const b = await prisma.tenantIdentityProvider.create({
            data: { tenantId: TENANT_B, name: 'visible-b', type: 'OIDC' },
        });
        const visibleToA = await withTenantDb(TENANT_A, async (tx) => {
            return tx.tenantIdentityProvider.findMany({
                where: { id: { in: [a.id, b.id] } },
                select: { id: true },
            });
        }, prisma);
        const ids = new Set(visibleToA.map((r) => r.id));
        expect(ids.has(a.id)).toBe(true);
        expect(ids.has(b.id)).toBe(false);
    });
});
