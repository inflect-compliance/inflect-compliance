/**
 * Unit coverage for `src/app-layer/usecases/org-audit.ts`.
 *
 * The org-audit read path uses the prisma singleton directly (no tenant
 * context). We mock `@/lib/prisma` and assert the WHERE/cursor branches,
 * using the REAL pagination util (encode/decode/clampLimit) so the
 * round-trip cursor is exercised end-to-end.
 *
 * Branches:
 *   - no cursor → cursorWhere null (no OR clause).
 *   - cursor present + decodable → OR clause built.
 *   - cursor present but undecodable → cursorWhere stays null.
 *   - action filter present vs absent.
 *   - hasNextPage true (rows > limit) → nextCursor encoded + trimmed.
 *   - hasNextPage false → nextCursor null.
 *   - actor/target present vs null mapping.
 */
const findMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: { orgAuditLog: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { listOrgAudit } from '@/app-layer/usecases/org-audit';
import { encodeCursor } from '@/lib/pagination';
import type { OrgContext } from '@/app-layer/types';

const ctx = { requestId: 'r', userId: 'u', organizationId: 'org-1', organizationSlug: 'acme' } as unknown as OrgContext;

function row(over: Record<string, unknown> = {}) {
    return {
        id: 'a1',
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
        action: 'ORG_MEMBER_ADDED',
        actorType: 'USER',
        actorUserId: 'u1',
        targetUserId: 't1',
        detailsJson: { x: 1 },
        requestId: 'req',
        entryHash: 'h',
        previousHash: null,
        version: 1,
        actor: { id: 'u1', email: 'a@x.io', name: 'A' },
        target: { id: 't1', email: 't@x.io', name: 'T' },
        ...over,
    };
}

beforeEach(() => {
    findMany.mockReset();
});

it('lists without a cursor and maps rows (no OR clause, no action filter)', async () => {
    findMany.mockResolvedValue([row(), row({ id: 'a2', actor: null, target: null })]);
    const res = await listOrgAudit(ctx, {});
    const where = findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    expect(where).not.toHaveProperty('OR');
    expect(where).not.toHaveProperty('action');
    expect(res.nextCursor).toBeNull();
    expect(res.rows[0].occurredAt).toBe('2026-06-01T00:00:00.000Z');
    expect(res.rows[1].actor).toBeNull(); // actor ?? null branch
    expect(res.rows[1].target).toBeNull();
});

it('applies an action filter when provided', async () => {
    findMany.mockResolvedValue([]);
    await listOrgAudit(ctx, { action: 'ORG_INVITE_CREATED' });
    expect(findMany.mock.calls[0][0].where.action).toBe('ORG_INVITE_CREATED');
});

it('builds the OR cursor clause for a decodable cursor', async () => {
    findMany.mockResolvedValue([]);
    const cursor = encodeCursor({ createdAt: '2026-05-01T00:00:00.000Z', id: 'a5' });
    await listOrgAudit(ctx, { cursor });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR[0].occurredAt.lt).toBeInstanceOf(Date);
    expect(where.OR[1].AND[1].id.lt).toBe('a5');
});

it('ignores an undecodable cursor (no OR clause)', async () => {
    findMany.mockResolvedValue([]);
    await listOrgAudit(ctx, { cursor: 'not-base64-json!!!' });
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('OR');
});

it('encodes nextCursor + trims when rows exceed the limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
        row({ id: `a${i}`, occurredAt: new Date(`2026-06-0${i + 1}T00:00:00.000Z`) }),
    );
    findMany.mockResolvedValue(rows);
    const res = await listOrgAudit(ctx, { limit: 2 });
    // take was limit+1 = 3; rows.length (3) > limit (2) → hasNextPage.
    expect(findMany.mock.calls[0][0].take).toBe(3);
    expect(res.rows).toHaveLength(2);
    expect(res.nextCursor).toBeTruthy();
});
