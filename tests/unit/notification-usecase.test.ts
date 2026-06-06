/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern. */

/**
 * Unit tests for `src/app-layer/usecases/notification.ts`.
 *
 * Two-function delegation file. Roadmap Q3 — supporting domain.
 * Pins the read-gate contract on both functions (note: even
 * markNotificationRead is gated on assertCanRead per the source —
 * by design any authenticated user can mark their own notifications).
 */

const mockDb = {} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/app-layer/repositories/NotificationRepository', () => ({
    NotificationRepository: {
        listMine: jest.fn(),
        markAsRead: jest.fn(),
    },
}));

import { NotificationRepository } from '@/app-layer/repositories/NotificationRepository';
import {
    listMyNotifications,
    markNotificationRead,
} from '@/app-layer/usecases/notification';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const readerCtx = makeRequestContext('READER');
const editorCtx = makeRequestContext('EDITOR');

describe('listMyNotifications', () => {
    it('delegates to NotificationRepository.listMine', async () => {
        (NotificationRepository.listMine as jest.Mock).mockResolvedValue([{ id: 'n-1' }]);
        const rows = await listMyNotifications(readerCtx);
        expect(rows).toEqual([{ id: 'n-1' }]);
        expect(NotificationRepository.listMine).toHaveBeenCalledWith(mockDb, readerCtx);
    });
});

describe('markNotificationRead', () => {
    it('marks notification + returns success', async () => {
        (NotificationRepository.markAsRead as jest.Mock).mockResolvedValue(undefined);
        const res = await markNotificationRead(editorCtx, 'n-1');
        expect(res).toEqual({ success: true });
        expect(NotificationRepository.markAsRead).toHaveBeenCalledWith(mockDb, editorCtx, 'n-1');
    });

    it('rejects when caller lacks read permission', async () => {
        const noReadCtx = makeRequestContext('READER', {
            permissions: { canRead: false, canWrite: false, canAdmin: false, canAudit: false, canExport: false },
        });
        await expect(markNotificationRead(noReadCtx, 'n-1')).rejects.toBeDefined();
        expect(NotificationRepository.markAsRead).not.toHaveBeenCalled();
    });
});
