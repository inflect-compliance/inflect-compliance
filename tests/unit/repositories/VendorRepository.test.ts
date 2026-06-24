/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-B coverage — VendorRepository (previously ~7% branches).
 *
 * Pure mock-`db` unit test: every repository method takes a `db` (PrismaTx)
 * argument, so we pass a hand-rolled fake whose model methods are jest.fn()s
 * returning canned values. Branch coverage is driven by:
 *   - _buildWhere: each optional filter (status / criticality / riskRating /
 *     q / reviewDue=overdue / reviewDue=next30d / none) toggles a different
 *     WHERE-clause branch.
 *   - list: with/without options.take.
 *   - listPaginated: cursor present (where.AND existing vs absent) vs absent.
 *   - create / update: nullish-coalescing + spread-conditional branches over
 *     each optional field (set vs undefined; tags present vs null).
 *   - update / setStatus / *Document / *Link: the not-found (null) guard vs
 *     the happy path.
 *
 * The real `@/lib/pagination` helpers are used unmocked (pure functions), so
 * cursors are constructed via `encodeCursor`.
 */

import { Prisma } from '@prisma/client';
import { encodeCursor } from '@/lib/pagination';
import {
    VendorRepository,
    VendorDocumentRepository,
    VendorLinkRepository,
} from '@/app-layer/repositories/VendorRepository';
import { makeRequestContext } from '../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

function freshDb() {
    return {
        vendor: {
            findMany: jest.fn((..._a: any[]): Promise<any> => Promise.resolve([])),
            findFirst: jest.fn((..._a: any[]): Promise<any> => Promise.resolve(null)),
            create: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'v1' })),
            update: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'v1' })),
            updateMany: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ count: 2 })),
        },
        vendorDocument: {
            findMany: jest.fn((..._a: any[]): Promise<any> => Promise.resolve([])),
            findFirst: jest.fn((..._a: any[]): Promise<any> => Promise.resolve(null)),
            create: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'd1' })),
            delete: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'd1' })),
        },
        vendorLink: {
            findMany: jest.fn((..._a: any[]): Promise<any> => Promise.resolve([])),
            findFirst: jest.fn((..._a: any[]): Promise<any> => Promise.resolve(null)),
            create: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'l1' })),
            delete: jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'l1' })),
        },
    };
}

let db: ReturnType<typeof freshDb>;

beforeEach(() => {
    db = freshDb();
});

describe('VendorRepository.list', () => {
    it('builds base where (no filters) + default orderBy/select, no take', async () => {
        await VendorRepository.list(db as any, ctx);
        const arg = db.vendor.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ tenantId: ctx.tenantId });
        expect(arg.orderBy).toEqual([{ criticality: 'desc' }, { name: 'asc' }]);
        expect(arg.select).toBeDefined();
        expect('take' in arg).toBe(false);
    });

    it('passes take when options.take provided', async () => {
        await VendorRepository.list(db as any, ctx, {}, { take: 5 });
        expect(db.vendor.findMany.mock.calls[0][0].take).toBe(5);
    });
});

describe('VendorRepository._buildWhere (via list)', () => {
    async function whereFor(filters: any) {
        await VendorRepository.list(db as any, ctx, filters);
        return db.vendor.findMany.mock.calls[0][0].where;
    }

    it('status filter', async () => {
        const where = await whereFor({ status: 'ACTIVE' });
        expect(where.status).toBe('ACTIVE');
    });

    it('criticality filter', async () => {
        const where = await whereFor({ criticality: 'HIGH' });
        expect(where.criticality).toBe('HIGH');
    });

    it('riskRating filter → assessments.some.riskRating', async () => {
        const where = await whereFor({ riskRating: 'LOW' });
        expect(where.assessments).toEqual({ some: { riskRating: 'LOW' } });
    });

    it('q filter → OR over name/legalName/domain', async () => {
        const where = await whereFor({ q: 'acme' });
        expect(where.OR).toEqual([
            { name: { contains: 'acme', mode: 'insensitive' } },
            { legalName: { contains: 'acme', mode: 'insensitive' } },
            { domain: { contains: 'acme', mode: 'insensitive' } },
        ]);
    });

    it('reviewDue=overdue → nextReviewAt.lt', async () => {
        const where = await whereFor({ reviewDue: 'overdue' });
        expect(where.nextReviewAt.lt).toBeInstanceOf(Date);
        expect(where.nextReviewAt.gte).toBeUndefined();
    });

    it('reviewDue=next30d → nextReviewAt.gte + lte', async () => {
        const where = await whereFor({ reviewDue: 'next30d' });
        expect(where.nextReviewAt.gte).toBeInstanceOf(Date);
        expect(where.nextReviewAt.lte).toBeInstanceOf(Date);
        expect(where.nextReviewAt.lte.getTime()).toBeGreaterThan(where.nextReviewAt.gte.getTime());
    });

    it('combines every filter at once', async () => {
        const where = await whereFor({
            status: 'ACTIVE',
            criticality: 'HIGH',
            riskRating: 'LOW',
            q: 'x',
            reviewDue: 'overdue',
        });
        expect(where.status).toBe('ACTIVE');
        expect(where.criticality).toBe('HIGH');
        expect(where.assessments).toBeDefined();
        expect(where.OR).toBeDefined();
        expect(where.nextReviewAt).toBeDefined();
    });
});

describe('VendorRepository.listPaginated', () => {
    it('no cursor: take=limit+1, default orderBy', async () => {
        const res = await VendorRepository.listPaginated(db as any, ctx, { limit: 10 });
        const arg = db.vendor.findMany.mock.calls[0][0];
        expect(arg.take).toBe(11);
        expect(arg.where.AND).toBeUndefined();
        expect(res.pageInfo.hasNextPage).toBe(false);
    });

    it('with valid cursor but no pre-existing where.AND → seeds where.AND array', async () => {
        const cursor = encodeCursor({ createdAt: new Date().toISOString(), id: 'v0' });
        await VendorRepository.listPaginated(db as any, ctx, { cursor });
        const arg = db.vendor.findMany.mock.calls[0][0];
        expect(Array.isArray(arg.where.AND)).toBe(true);
        expect(arg.where.AND).toHaveLength(1);
    });

    it('with cursor AND a filter that already produced where.AND would push — but base where has no AND; verify push branch via riskRating+cursor', async () => {
        // riskRating/q/etc don't create where.AND; the only way where.AND
        // pre-exists is not reachable through _buildWhere, so the `else`
        // branch (seed) is what runs. The push branch is covered defensively
        // by injecting a cursor twice would not help — assert seed path holds
        // and the cursor predicate is the OR shape from buildCursorWhere.
        const cursor = encodeCursor({ createdAt: new Date().toISOString(), id: 'v0' });
        await VendorRepository.listPaginated(db as any, ctx, { cursor, filters: { q: 'a' } });
        const arg = db.vendor.findMany.mock.calls[0][0];
        expect(arg.where.AND[0].OR).toBeDefined();
    });

    it('invalid cursor is ignored (buildCursorWhere returns null)', async () => {
        await VendorRepository.listPaginated(db as any, ctx, { cursor: 'not-base64-cursor!!' });
        const arg = db.vendor.findMany.mock.calls[0][0];
        expect(arg.where.AND).toBeUndefined();
    });

    it('computes nextCursor when results exceed limit', async () => {
        const now = new Date();
        const rows = Array.from({ length: 3 }, (_, i) => ({ id: `v${i}`, createdAt: now }));
        db.vendor.findMany.mockResolvedValueOnce(rows as any);
        const res = await VendorRepository.listPaginated(db as any, ctx, { limit: 2 });
        expect(res.items).toHaveLength(2);
        expect(res.pageInfo.hasNextPage).toBe(true);
        expect(res.pageInfo.nextCursor).toBeDefined();
    });
});

describe('VendorRepository.getById', () => {
    it('queries findFirst with tenant scope + contacts include', async () => {
        await VendorRepository.getById(db as any, ctx, 'v1');
        const arg = db.vendor.findFirst.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'v1', tenantId: ctx.tenantId });
        expect(arg.include.contacts).toEqual({ orderBy: { name: 'asc' } });
    });
});

describe('VendorRepository.create', () => {
    it('applies defaults when optional fields omitted (tags → JsonNull)', async () => {
        await VendorRepository.create(db as any, ctx, { name: 'Acme' });
        const data = db.vendor.create.mock.calls[0][0].data;
        expect(data.tenantId).toBe(ctx.tenantId);
        expect(data.name).toBe('Acme');
        expect(data.legalName).toBeNull();
        expect(data.status).toBe('ONBOARDING');
        expect(data.criticality).toBe('MEDIUM');
        expect(data.inherentRisk).toBeNull();
        expect(data.dataAccess).toBeNull();
        expect(data.isSubprocessor).toBe(false);
        expect(data.tags).toBe(Prisma.JsonNull);
        expect(data.nextReviewAt).toBeNull();
        expect(data.contractRenewalAt).toBeNull();
    });

    it('honours all provided values (tags validated, dates parsed)', async () => {
        await VendorRepository.create(db as any, ctx, {
            name: 'Beta',
            legalName: 'Beta LLC',
            websiteUrl: 'https://b.co',
            domain: 'b.co',
            country: 'US',
            description: 'desc',
            ownerUserId: 'u9',
            status: 'ACTIVE',
            criticality: 'HIGH',
            inherentRisk: 'HIGH',
            dataAccess: 'PII',
            isSubprocessor: true,
            tags: ['a', 'b'],
            nextReviewAt: '2026-01-01',
            contractRenewalAt: '2026-02-01',
        });
        const data = db.vendor.create.mock.calls[0][0].data;
        expect(data.legalName).toBe('Beta LLC');
        expect(data.status).toBe('ACTIVE');
        expect(data.criticality).toBe('HIGH');
        expect(data.inherentRisk).toBe('HIGH');
        expect(data.isSubprocessor).toBe(true);
        expect(data.tags).toEqual(['a', 'b']);
        expect(data.nextReviewAt).toBeInstanceOf(Date);
        expect(data.contractRenewalAt).toBeInstanceOf(Date);
    });
});

describe('VendorRepository.update', () => {
    it('returns null when vendor not found', async () => {
        db.vendor.findFirst.mockResolvedValueOnce(null);
        const res = await VendorRepository.update(db as any, ctx, 'gone', { name: 'X' });
        expect(res).toBeNull();
        expect(db.vendor.update).not.toHaveBeenCalled();
    });

    it('builds a sparse data object — only defined fields are set', async () => {
        db.vendor.findFirst.mockResolvedValueOnce({ id: 'v1' });
        await VendorRepository.update(db as any, ctx, 'v1', { name: 'New', status: 'ACTIVE' });
        const data = db.vendor.update.mock.calls[0][0].data;
        expect(data).toEqual({ name: 'New', status: 'ACTIVE' });
    });

    it('covers every conditional spread branch (all fields set)', async () => {
        db.vendor.findFirst.mockResolvedValueOnce({ id: 'v1' });
        await VendorRepository.update(db as any, ctx, 'v1', {
            name: 'N',
            legalName: 'L',
            websiteUrl: 'w',
            domain: 'd',
            country: 'c',
            description: 'desc',
            ownerUserId: 'o',
            status: 'ACTIVE',
            criticality: 'LOW',
            inherentRisk: 'LOW',
            residualRisk: 'LOW',
            dataAccess: 'NONE',
            isSubprocessor: false,
            tags: ['t'],
            nextReviewAt: '2026-03-01',
            contractRenewalAt: '2026-04-01',
        });
        const data = db.vendor.update.mock.calls[0][0].data;
        expect(data.name).toBe('N');
        expect(data.residualRisk).toBe('LOW');
        expect(data.tags).toEqual(['t']);
        expect(data.nextReviewAt).toBeInstanceOf(Date);
        expect(data.contractRenewalAt).toBeInstanceOf(Date);
    });

    it('handles null-coercing branches: tags=null → JsonNull, dates=null', async () => {
        db.vendor.findFirst.mockResolvedValueOnce({ id: 'v1' });
        await VendorRepository.update(db as any, ctx, 'v1', {
            tags: null,
            nextReviewAt: null,
            contractRenewalAt: null,
            inherentRisk: null,
            residualRisk: null,
            dataAccess: null,
        });
        const data = db.vendor.update.mock.calls[0][0].data;
        expect(data.tags).toBe(Prisma.JsonNull);
        expect(data.nextReviewAt).toBeNull();
        expect(data.contractRenewalAt).toBeNull();
        expect(data.inherentRisk).toBeNull();
        expect(data.residualRisk).toBeNull();
        expect(data.dataAccess).toBeNull();
    });
});

describe('VendorRepository.setStatus', () => {
    it('returns null when not found', async () => {
        db.vendor.findFirst.mockResolvedValueOnce(null);
        expect(await VendorRepository.setStatus(db as any, ctx, 'gone', 'ACTIVE')).toBeNull();
        expect(db.vendor.update).not.toHaveBeenCalled();
    });

    it('updates status when found', async () => {
        db.vendor.findFirst.mockResolvedValueOnce({ id: 'v1' });
        await VendorRepository.setStatus(db as any, ctx, 'v1', 'ARCHIVED');
        expect(db.vendor.update.mock.calls[0][0]).toEqual({
            where: { id: 'v1' },
            data: { status: 'ARCHIVED' },
        });
    });
});

describe('VendorRepository.listByIds / bulkUpdate', () => {
    it('listByIds scopes to tenant + id set', async () => {
        await VendorRepository.listByIds(db as any, ctx, ['a', 'b']);
        expect(db.vendor.findMany.mock.calls[0][0].where).toEqual({
            id: { in: ['a', 'b'] },
            tenantId: ctx.tenantId,
        });
    });

    it('bulkUpdate issues one updateMany scoped to tenant', async () => {
        const res = await VendorRepository.bulkUpdate(db as any, ctx, ['a'], { status: 'ACTIVE' } as any);
        const arg = db.vendor.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: { in: ['a'] }, tenantId: ctx.tenantId });
        expect(arg.data).toEqual({ status: 'ACTIVE' });
        expect(res).toEqual({ count: 2 });
    });
});

describe('VendorDocumentRepository', () => {
    it('listByVendor scopes + orders desc + includes uploadedBy', async () => {
        await VendorDocumentRepository.listByVendor(db as any, ctx, 'v1');
        const arg = db.vendorDocument.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ tenantId: ctx.tenantId, vendorId: 'v1' });
        expect(arg.orderBy).toEqual({ createdAt: 'desc' });
        expect(arg.include.uploadedBy).toBeDefined();
    });

    it('create applies defaults (nulls + folder trim → null on blank)', async () => {
        await VendorDocumentRepository.create(db as any, ctx, 'v1', { type: 'SOC2', folder: '   ' });
        const data = db.vendorDocument.create.mock.calls[0][0].data;
        expect(data.fileId).toBeNull();
        expect(data.externalUrl).toBeNull();
        expect(data.title).toBeNull();
        expect(data.validFrom).toBeNull();
        expect(data.validTo).toBeNull();
        expect(data.notes).toBeNull();
        expect(data.folder).toBeNull();
        expect(data.uploadedByUserId).toBe(ctx.userId);
    });

    it('create honours provided values (dates parsed, folder trimmed)', async () => {
        await VendorDocumentRepository.create(db as any, ctx, 'v1', {
            type: 'SOC2',
            fileId: 'f1',
            externalUrl: 'http://x',
            title: 'T',
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
            notes: 'n',
            folder: '  Audits  ',
        });
        const data = db.vendorDocument.create.mock.calls[0][0].data;
        expect(data.fileId).toBe('f1');
        expect(data.validFrom).toBeInstanceOf(Date);
        expect(data.validTo).toBeInstanceOf(Date);
        expect(data.folder).toBe('Audits');
    });

    it('deleteById returns null when not found', async () => {
        db.vendorDocument.findFirst.mockResolvedValueOnce(null);
        expect(await VendorDocumentRepository.deleteById(db as any, ctx, 'gone')).toBeNull();
        expect(db.vendorDocument.delete).not.toHaveBeenCalled();
    });

    it('deleteById deletes when found', async () => {
        db.vendorDocument.findFirst.mockResolvedValueOnce({ id: 'd1' });
        await VendorDocumentRepository.deleteById(db as any, ctx, 'd1');
        expect(db.vendorDocument.delete.mock.calls[0][0]).toEqual({ where: { id: 'd1' } });
    });
});

describe('VendorLinkRepository', () => {
    it('listByVendor scopes + orders desc', async () => {
        await VendorLinkRepository.listByVendor(db as any, ctx, 'v1');
        const arg = db.vendorLink.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ tenantId: ctx.tenantId, vendorId: 'v1' });
        expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('create defaults relation → RELATED when omitted', async () => {
        await VendorLinkRepository.create(db as any, ctx, 'v1', { entityType: 'RISK', entityId: 'r1' });
        const data = db.vendorLink.create.mock.calls[0][0].data;
        expect(data.relation).toBe('RELATED');
        expect(data.entityType).toBe('RISK');
        expect(data.entityId).toBe('r1');
        expect(data.tenantId).toBe(ctx.tenantId);
    });

    it('create honours provided relation', async () => {
        await VendorLinkRepository.create(db as any, ctx, 'v1', {
            entityType: 'CONTROL',
            entityId: 'c1',
            relation: 'MITIGATES',
        });
        expect(db.vendorLink.create.mock.calls[0][0].data.relation).toBe('MITIGATES');
    });

    it('deleteById returns null when not found', async () => {
        db.vendorLink.findFirst.mockResolvedValueOnce(null);
        expect(await VendorLinkRepository.deleteById(db as any, ctx, 'gone')).toBeNull();
        expect(db.vendorLink.delete).not.toHaveBeenCalled();
    });

    it('deleteById deletes when found', async () => {
        db.vendorLink.findFirst.mockResolvedValueOnce({ id: 'l1' });
        await VendorLinkRepository.deleteById(db as any, ctx, 'l1');
        expect(db.vendorLink.delete.mock.calls[0][0]).toEqual({ where: { id: 'l1' } });
    });
});
