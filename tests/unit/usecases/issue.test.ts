/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * Unit tests for src/app-layer/usecases/issue.ts
 *
 * Wave 4 of GAP-02. The Issue usecase is a deprecated facade over
 * WorkItemRepository — every old API route routes through here. The
 * security guarantees still apply (gates + sanitisation + audit emit),
 * but the test surface is thinner because most plumbing is shared
 * with task.test.ts.
 *
 * Behaviours protected:
 *   1. assertCanCreateIssue / assertCanUpdateIssue / assertCanComment
 *      gates fire before any repo call.
 *   2. addIssueComment sanitises body via sanitizePlainText (Epic C.5).
 *   3. setIssueStatus captures fromStatus before mutation, so the
 *      automation event payload reflects the transition.
 *   4. ISSUE_CREATED audit + emitAutomationEvent on createIssue.
 *   5. notFound paths on getIssue / updateIssue / setIssueStatus.
 */

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(),
}));

jest.mock('@/app-layer/repositories/WorkItemRepository', () => ({
    WorkItemRepository: {
        list: jest.fn(),
        getById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        setStatus: jest.fn(),
        assign: jest.fn(),
    },
    TaskLinkRepository: {},
    TaskCommentRepository: {
        add: jest.fn(),
    },
    TaskWatcherRepository: {},
}));

jest.mock('@/app-layer/repositories/EvidenceBundleRepository', () => ({
    EvidenceBundleRepository: {},
}));

jest.mock('@/lib/security/sanitize', () => ({
    sanitizePlainText: jest.fn((s: string | null | undefined) => `SANITISED(${s})`),
}));

jest.mock('@/app-layer/automation', () => ({
    emitAutomationEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
    createIssue,
    updateIssue,
    setIssueStatus,
    addIssueComment,
} from '@/app-layer/usecases/issue';
import { runInTenantContext } from '@/lib/db-context';
import {
    WorkItemRepository,
    TaskCommentRepository,
} from '@/app-layer/repositories/WorkItemRepository';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { emitAutomationEvent } from '@/app-layer/automation';
import { logEvent } from '@/app-layer/events/audit';
import { makeRequestContext } from '../../helpers/make-context';

const mockRunInTx = runInTenantContext as jest.MockedFunction<typeof runInTenantContext>;
const mockGetById = WorkItemRepository.getById as jest.MockedFunction<typeof WorkItemRepository.getById>;
const mockCreate = WorkItemRepository.create as jest.MockedFunction<typeof WorkItemRepository.create>;
const mockUpdate = WorkItemRepository.update as jest.MockedFunction<typeof WorkItemRepository.update>;
const mockSetStatus = WorkItemRepository.setStatus as jest.MockedFunction<typeof WorkItemRepository.setStatus>;
const mockCommentAdd = TaskCommentRepository.add as jest.MockedFunction<typeof TaskCommentRepository.add>;
const mockSanitize = sanitizePlainText as jest.MockedFunction<typeof sanitizePlainText>;
const mockEmitEvent = emitAutomationEvent as jest.MockedFunction<typeof emitAutomationEvent>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;

beforeEach(() => {
    jest.clearAllMocks();
    mockSanitize.mockImplementation((s: string | null | undefined) => `SANITISED(${s})`);
    mockCreate.mockResolvedValue({
        id: 'i1', key: 'ISSUE-1', title: 'X', severity: 'HIGH',
        status: 'OPEN', assigneeUserId: null,
    } as never);
    mockUpdate.mockResolvedValue({ id: 'i1' } as never);
    mockSetStatus.mockResolvedValue({ id: 'i1', status: 'CLOSED' } as never);
    mockCommentAdd.mockResolvedValue({ id: 'comment-1' } as never);
});

describe('createIssue', () => {
    it('rejects READER (no canCreateIssue)', async () => {
        await expect(
            createIssue(makeRequestContext('READER'), { title: 'x', type: 'BUG' }),
        ).rejects.toThrow();
        expect(mockRunInTx).not.toHaveBeenCalled();
    });

    it('emits ISSUE_CREATED audit AND fires emitAutomationEvent', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn({} as never));

        await createIssue(makeRequestContext('EDITOR'), { title: 'x', type: 'BUG' });

        expect(mockLog).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'ISSUE_CREATED' }),
        );
        expect(mockEmitEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ event: 'ISSUE_CREATED' }),
        );
    });
});

describe('updateIssue', () => {
    it('rejects READER on update', async () => {
        await expect(
            updateIssue(makeRequestContext('READER'), 'i1', { title: 'x' }),
        ).rejects.toThrow();
    });

    it('throws notFound when repo returns null (cross-tenant id)', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn({} as never));
        mockUpdate.mockResolvedValueOnce(null as never);

        await expect(
            updateIssue(makeRequestContext('EDITOR'), 'tenant-B-id', { title: 'x' }),
        ).rejects.toThrow(/Issue not found/);
    });
});

describe('setIssueStatus — fromStatus capture', () => {
    it('passes fromStatus into emitAutomationEvent payload', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn({} as never));
        // S8 — RESOLVED→CLOSED is the canonical resolution-finalisation
        // transition. The legacy fixture used OPEN→CLOSED, which is
        // now illegal under WORK_ITEM_TRANSITIONS (you must go
        // through RESOLVED first).
        mockGetById.mockResolvedValueOnce({ id: 'i1', status: 'RESOLVED' } as never);

        // S8 — terminal transitions require a non-empty resolution.
        await setIssueStatus(makeRequestContext('EDITOR'), 'i1', 'CLOSED', 'archived');

        const call = mockEmitEvent.mock.calls.find(
            c => (c[1] as any).event === 'ISSUE_STATUS_CHANGED',
        );
        const payload = (call as any[])[1];
        expect(payload.data.fromStatus).toBe('RESOLVED');
        expect(payload.data.toStatus).toBe('CLOSED');
        // Regression: same as the task.ts equivalent — capturing
        // fromStatus AFTER mutation collapses transitions to "X → X".
        expect(payload.stableKey).toBe('i1:RESOLVED:CLOSED');
    });

    it('throws notFound when the existing row is missing', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn({} as never));
        mockGetById.mockResolvedValueOnce(null as never);

        await expect(
            setIssueStatus(makeRequestContext('EDITOR'), 'missing', 'CLOSED'),
        ).rejects.toThrow(/Issue not found/);
    });
});

describe('addIssueComment — Epic C.5', () => {
    it('rejects READER (canComment gate)', async () => {
        await expect(
            addIssueComment(makeRequestContext('READER'), 'i1', 'hi'),
        ).rejects.toThrow();
    });

    it('sanitises body BEFORE the repository write', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn({} as never));

        await addIssueComment(
            makeRequestContext('EDITOR'),
            'i1',
            '<img onerror=...>',
        );

        expect(mockSanitize).toHaveBeenCalledWith('<img onerror=...>');
        const addCall = mockCommentAdd.mock.calls[0];
        // signature: (db, ctx, issueId, body)
        expect(addCall[3]).toBe('SANITISED(<img onerror=...>)');
    });
});
