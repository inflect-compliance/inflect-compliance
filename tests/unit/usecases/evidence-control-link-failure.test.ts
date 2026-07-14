/**
 * EP-4 Part 2 — control-link failure must NOT silently succeed.
 *
 * EP-3 made evidence↔control link creation transactional: `createEvidence`
 * (and `uploadEvidenceFile`) call `EvidenceRepository.createControlLinks`
 * INSIDE the same `runInTenantContext` transaction as the evidence write.
 * The old best-effort `ControlEvidenceLink` bridge with an empty `catch`
 * is gone.
 *
 * These behavioural (mock-based) tests lock that invariant: when the join
 * write throws, the create surfaces the failure (rejects) rather than
 * returning a linked-looking success, and the audit event — which fires
 * AFTER the link write in the same tx — never lands. On a real DB the
 * throw rolls the transaction back; here we assert the usecase propagates
 * it and stops.
 */

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(),
}));

jest.mock('@/app-layer/repositories/EvidenceRepository', () => ({
    EvidenceRepository: {
        create: jest.fn(),
        createControlLinks: jest.fn(),
        filterExistingControlIds: jest.fn(
            async (_db: unknown, _ctx: unknown, ids: string[]) => new Set(ids),
        ),
    },
}));

jest.mock('@/lib/cache/list-cache', () => ({
    cachedListRead: jest.fn(),
    bumpEntityCacheVersion: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));

import { createEvidence } from '@/app-layer/usecases/evidence';
import { runInTenantContext } from '@/lib/db-context';
import { EvidenceRepository } from '@/app-layer/repositories/EvidenceRepository';
import { bumpEntityCacheVersion } from '@/lib/cache/list-cache';
import { logEvent } from '@/app-layer/events/audit';
import { makeRequestContext } from '../../helpers/make-context';

const mockRunInTx = runInTenantContext as jest.MockedFunction<typeof runInTenantContext>;
const mockCreate = EvidenceRepository.create as jest.MockedFunction<typeof EvidenceRepository.create>;
const mockCreateLinks = EvidenceRepository.createControlLinks as jest.MockedFunction<typeof EvidenceRepository.createControlLinks>;
const mockBump = bumpEntityCacheVersion as jest.MockedFunction<typeof bumpEntityCacheVersion>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;

// A sentinel db handle threaded through the transaction so we can prove the
// evidence write + the link write share the SAME transaction object.
const TX_DB = { __sentinel: 'tx' } as never;

beforeEach(() => {
    jest.clearAllMocks();
    mockRunInTx.mockImplementation(async (_ctx, fn) => fn(TX_DB));
    mockCreate.mockResolvedValue({ id: 'ev-1', title: 'Doc' } as never);
});

describe('createEvidence — control-link failure surfaces (EP-4 Part 2)', () => {
    it('propagates a link-write failure instead of returning a linked-looking success', async () => {
        mockCreateLinks.mockRejectedValueOnce(new Error('link write failed'));

        await expect(
            createEvidence(makeRequestContext('EDITOR', { tenantId: 'tenant-A' }), {
                type: 'LINK',
                title: 'Doc',
                controlIds: ['ctrl-1'],
                content: 'https://example.com/x',
            }),
        ).rejects.toThrow(/link write failed/);
    });

    it('does not fire the create audit event when the link write throws', async () => {
        mockCreateLinks.mockRejectedValueOnce(new Error('link write failed'));

        await createEvidence(
            makeRequestContext('EDITOR', { tenantId: 'tenant-A' }),
            { type: 'LINK', title: 'Doc', controlIds: ['ctrl-1'], content: 'https://example.com/x' },
        ).catch(() => undefined);

        // logEvent fires AFTER createControlLinks in the same tx — a rolled-back
        // link write means the CREATE audit must never have been emitted.
        expect(mockLog).not.toHaveBeenCalled();
        // And the post-commit cache bump (only reached after the tx resolves)
        // must not run either — no half-committed "created" signal escapes.
        expect(mockBump).not.toHaveBeenCalled();
    });

    it('writes the evidence row and its control links in the SAME transaction', async () => {
        mockCreateLinks.mockResolvedValueOnce(undefined);

        await createEvidence(
            makeRequestContext('EDITOR', { tenantId: 'tenant-A' }),
            { type: 'LINK', title: 'Doc', controlIds: ['ctrl-1'], content: 'https://example.com/x' },
        );

        // Both the evidence write and the join write received the SAME tx db
        // handle → they cannot partially succeed (EP-3's transactional link).
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreateLinks).toHaveBeenCalledTimes(1);
        expect(mockCreate.mock.calls[0][0]).toBe(TX_DB);
        expect(mockCreateLinks.mock.calls[0][0]).toBe(TX_DB);
    });
});
