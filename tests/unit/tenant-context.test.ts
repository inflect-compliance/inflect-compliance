/**
 * Unit tests for tenant context resolvers.
 *
 * Tests resolveTenantContext and getDefaultTenantForUser.
 * Uses mocked Prisma client.
 */

// @/env is already globally mocked via jest.config.js moduleNameMapper

const mockPrisma = {
    tenant: {
        findUnique: jest.fn(),
    },
    tenantMembership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    },
};

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: mockPrisma,
}));

import {
    resolveTenantContext,
    getDefaultTenantForUser,
} from '@/lib/tenant-context';

// ─── Test fixtures ───

const TENANT = {
    id: 'tenant-1',
    slug: 'acme-corp',
    name: 'Acme Corp',
    industry: 'Tech',
    scope: null,
    context: null,
    interestedParties: null,
    boundaries: null,
    exclusions: null,
    reminderDaysBefore: 14,
    maxRiskScale: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const MEMBERSHIP = {
    id: 'member-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'EDITOR' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
};

// ─── resolveTenantContext ───

describe('resolveTenantContext', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns tenant context when membership exists (by slug)', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
        mockPrisma.tenantMembership.findUnique.mockResolvedValue(MEMBERSHIP);

        const ctx = await resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-1');

        expect(ctx.tenant.id).toBe('tenant-1');
        expect(ctx.membership.id).toBe('member-1');
        expect(ctx.role).toBe('EDITOR');
        expect(ctx.permissions.canRead).toBe(true);
        expect(ctx.permissions.canWrite).toBe(true);
        expect(ctx.permissions.canAdmin).toBe(false);
    });

    it('returns tenant context when membership exists (by tenantId)', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
        mockPrisma.tenantMembership.findUnique.mockResolvedValue(MEMBERSHIP);

        const ctx = await resolveTenantContext({ tenantId: 'tenant-1' }, 'user-1');

        expect(ctx.tenant.id).toBe('tenant-1');
        expect(ctx.role).toBe('EDITOR');
    });

    it('throws notFound when tenant does not exist', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(null);

        await expect(
            resolveTenantContext({ tenantSlug: 'does-not-exist' }, 'user-1')
        ).rejects.toThrow();
    });

    it('throws forbidden when user has no membership', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
        mockPrisma.tenantMembership.findUnique.mockResolvedValue(null);

        await expect(
            resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-1')
        ).rejects.toThrow();
    });

    it('throws notFound when no identifier provided', async () => {
        await expect(
            resolveTenantContext({}, 'user-1')
        ).rejects.toThrow();
    });

    it('returns correct permissions for ADMIN role', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
        mockPrisma.tenantMembership.findUnique.mockResolvedValue({
            ...MEMBERSHIP,
            role: 'ADMIN',
        });

        const ctx = await resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-1');

        expect(ctx.permissions.canRead).toBe(true);
        expect(ctx.permissions.canWrite).toBe(true);
        expect(ctx.permissions.canAdmin).toBe(true);
        expect(ctx.permissions.canAudit).toBe(true);
        expect(ctx.permissions.canExport).toBe(true);
    });

    it('returns correct permissions for READER role', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
        mockPrisma.tenantMembership.findUnique.mockResolvedValue({
            ...MEMBERSHIP,
            role: 'READER',
        });

        const ctx = await resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-1');

        expect(ctx.permissions.canRead).toBe(true);
        expect(ctx.permissions.canWrite).toBe(false);
        expect(ctx.permissions.canAdmin).toBe(false);
        expect(ctx.permissions.canAudit).toBe(false);
        expect(ctx.permissions.canExport).toBe(false);
    });

    it('returns correct permissions for AUDITOR role', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
        mockPrisma.tenantMembership.findUnique.mockResolvedValue({
            ...MEMBERSHIP,
            role: 'AUDITOR',
        });

        const ctx = await resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-1');

        expect(ctx.permissions.canRead).toBe(true);
        expect(ctx.permissions.canWrite).toBe(false);
        expect(ctx.permissions.canAdmin).toBe(false);
        expect(ctx.permissions.canAudit).toBe(true);
        expect(ctx.permissions.canExport).toBe(true);
    });
});

// ─── getDefaultTenantForUser ───

describe('getDefaultTenantForUser', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns first membership by createdAt', async () => {
        const membershipWithTenant = {
            ...MEMBERSHIP,
            tenant: TENANT,
        };
        mockPrisma.tenantMembership.findFirst.mockResolvedValue(membershipWithTenant);

        const result = await getDefaultTenantForUser('user-1');

        expect(result).toBeTruthy();
        expect(result!.tenantId).toBe('tenant-1');
        expect(result!.tenant.name).toBe('Acme Corp');
        expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalledWith({
            // Excludes soft-deleted (org-removed) tenants — never default
            // a user into a removed workspace.
            where: { userId: 'user-1', tenant: { deletedAt: null } },
            orderBy: { createdAt: 'asc' },
            include: { tenant: true },
        });
    });

    it('returns null when user has no memberships', async () => {
        mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

        const result = await getDefaultTenantForUser('user-1');
        expect(result).toBeNull();
    });
});
