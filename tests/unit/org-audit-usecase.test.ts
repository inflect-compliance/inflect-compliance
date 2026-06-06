/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/org-audit.ts`.
 *
 * Roadmap Q2 — Audit + audit-trail. Epic B org audit-log read path.
 * Mocks the prisma client (default export) + the pagination helpers.
 *
 * Covers:
 *   - listOrgAudit no-cursor — order by occurredAt+id desc, take+1
 *     for hasNextPage, organizationId scope, no nextCursor when at
 *     end, ISO-stringified occurredAt in output.
 *   - listOrgAudit with cursor — decoded into occurredAt+id, OR-WHERE
 *     shape (lt occurredAt OR same occurredAt + lt id).
 *   - Action filter — adds `action: <enum>` to the where clause.
 *   - hasNextPage — when rows == limit+1, trims to limit and emits
 *     a base64-encoded nextCursor from the last row.
 *   - actor/target normalisation — null when relation absent.
 *
 * Removes org-audit.ts from EXEMPTIONS on PR (along with auditLog
 * and mapping already removed → ratchet at 7).
 */

const mockPrisma = {
    orgAuditLog: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
}));

jest.mock('@/lib/pagination', () => ({
    encodeCursor: jest.fn((c: any) => `cur:${c.createdAt}:${c.id}`),
    decodeCursor: jest.fn(),
    clampLimit: jest.fn((n: number | undefined) => n ?? 25),
}));

import { encodeCursor, decodeCursor } from '@/lib/pagination';
import { listOrgAudit } from '@/app-layer/usecases/org-audit';

beforeEach(() => {
    jest.clearAllMocks();
});

const ctx = { organizationId: 'org-1' } as any;

const baseRow = (overrides: Partial<any> = {}) => ({
    id: 'a-1',
    occurredAt: new Date('2026-06-01T12:00:00Z'),
    action: 'MEMBER_INVITED',
    actorType: 'USER',
    actorUserId: 'u-1',
    targetUserId: 'u-2',
    detailsJson: { x: 1 },
    requestId: 'req-1',
    entryHash: 'h1',
    previousHash: null,
    version: 1,
    actor: { id: 'u-1', email: 'a@e', name: 'Alice' },
    target: { id: 'u-2', email: 'b@e', name: 'Bob' },
    ...overrides,
});

// ─── No cursor — first page ────────────────────────────────────────

describe('listOrgAudit — first page', () => {
    it('queries orgAuditLog scoped to organizationId, ordered desc, take limit+1', async () => {
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([]);

        await listOrgAudit(ctx, { limit: 10 });

        const args = (mockPrisma.orgAuditLog.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where).toEqual({ organizationId: 'org-1' });
        expect(args.orderBy).toEqual([{ occurredAt: 'desc' }, { id: 'desc' }]);
        expect(args.take).toBe(11); // limit + 1 for hasNextPage probe
    });

    it('returns ISO-stringified occurredAt in the output rows', async () => {
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([baseRow()]);

        const res = await listOrgAudit(ctx);

        expect(res.rows[0].occurredAt).toBe('2026-06-01T12:00:00.000Z');
        expect(res.rows[0].action).toBe('MEMBER_INVITED');
        expect(res.rows[0].actor).toEqual({ id: 'u-1', email: 'a@e', name: 'Alice' });
        expect(res.rows[0].target).toEqual({ id: 'u-2', email: 'b@e', name: 'Bob' });
    });

    it('normalises actor + target to null when relation is absent', async () => {
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([
            baseRow({ actor: null, target: null }),
        ]);

        const res = await listOrgAudit(ctx);

        expect(res.rows[0].actor).toBeNull();
        expect(res.rows[0].target).toBeNull();
    });

    it('returns nextCursor: null when count <= limit (no more pages)', async () => {
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([baseRow()]);

        const res = await listOrgAudit(ctx, { limit: 25 });

        expect(res.nextCursor).toBeNull();
        expect(encodeCursor).not.toHaveBeenCalled();
    });
});

// ─── hasNextPage ──────────────────────────────────────────────────

describe('listOrgAudit — hasNextPage', () => {
    it('trims to limit and emits encoded cursor when count == limit+1', async () => {
        const rows = [
            baseRow({ id: 'a-1', occurredAt: new Date('2026-06-03T00:00:00Z') }),
            baseRow({ id: 'a-2', occurredAt: new Date('2026-06-02T00:00:00Z') }),
            baseRow({ id: 'a-3', occurredAt: new Date('2026-06-01T00:00:00Z') }), // probe row
        ];
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue(rows);

        const res = await listOrgAudit(ctx, { limit: 2 });

        expect(res.rows).toHaveLength(2);
        // Cursor built from the last trimmed row (a-2)
        expect(encodeCursor).toHaveBeenCalledWith({
            createdAt: '2026-06-02T00:00:00.000Z',
            id: 'a-2',
        });
        expect(res.nextCursor).toBe('cur:2026-06-02T00:00:00.000Z:a-2');
    });
});

// ─── Action filter ────────────────────────────────────────────────

describe('listOrgAudit — action filter', () => {
    it('adds action to the where clause when supplied', async () => {
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([]);

        await listOrgAudit(ctx, { action: 'MEMBER_INVITED' as any });

        const args = (mockPrisma.orgAuditLog.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where.action).toBe('MEMBER_INVITED');
    });
});

// ─── Cursor decoding ──────────────────────────────────────────────

describe('listOrgAudit — cursor decoding', () => {
    it('skips cursor when decode fails (treats as first page)', async () => {
        (decodeCursor as jest.Mock).mockReturnValue(null);
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([]);

        await listOrgAudit(ctx, { cursor: 'garbage' });

        const args = (mockPrisma.orgAuditLog.findMany as jest.Mock).mock.calls[0][0];
        // Where shouldn't contain a cursor OR clause
        expect(args.where.OR).toBeUndefined();
        expect(args.where).toEqual({ organizationId: 'org-1' });
    });

    it('applies the OR-WHERE shape on a valid cursor (occurredAt lt OR same+id lt)', async () => {
        const occurred = '2026-06-01T12:00:00.000Z';
        (decodeCursor as jest.Mock).mockReturnValue({ createdAt: occurred, id: 'a-1' });
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([]);

        await listOrgAudit(ctx, { cursor: 'valid' });

        const args = (mockPrisma.orgAuditLog.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where.OR).toBeDefined();
        expect(args.where.OR).toEqual([
            { occurredAt: { lt: new Date(occurred) } },
            {
                AND: [
                    { occurredAt: new Date(occurred) },
                    { id: { lt: 'a-1' } },
                ],
            },
        ]);
    });

    it('cursor + action filter combine in the where', async () => {
        const occurred = '2026-06-01T12:00:00.000Z';
        (decodeCursor as jest.Mock).mockReturnValue({ createdAt: occurred, id: 'a-1' });
        (mockPrisma.orgAuditLog.findMany as jest.Mock).mockResolvedValue([]);

        await listOrgAudit(ctx, { cursor: 'valid', action: 'MEMBER_REMOVED' as any });

        const args = (mockPrisma.orgAuditLog.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where.organizationId).toBe('org-1');
        expect(args.where.action).toBe('MEMBER_REMOVED');
        expect(args.where.OR).toBeDefined();
    });
});
