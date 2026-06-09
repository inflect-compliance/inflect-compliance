/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/**
 * SP-5 — export a frozen audit pack to SharePoint. Pack data, the Graph client,
 * and the DB are mocked; this locks the FROZEN gate, the ZIP upload, and the
 * AuditPack + IntegrationExecution record.
 */
const mockDb = {
    auditPack: { update: jest.fn() },
    integrationExecution: { create: jest.fn() },
};
const mockClient = { uploadNewFile: jest.fn() };
const mockGetPack = jest.fn();
const mockExport = jest.fn();

jest.mock('@/lib/db-context', () => ({
    __esModule: true,
    runInTenantContext: (_ctx: any, fn: (db: any) => any) => fn(mockDb),
}));
jest.mock('@/app-layer/usecases/audit-readiness/packs', () => ({
    __esModule: true,
    getAuditPack: (...a: unknown[]) => mockGetPack(...a),
    exportAuditPack: (...a: unknown[]) => mockExport(...a),
}));
jest.mock('@/app-layer/integrations/providers/sharepoint', () => ({
    __esModule: true,
    getSharePointClient: jest.fn(async () => mockClient),
    listSharePointConnections: jest.fn(async () => [{ id: 'c1' }]),
}));
jest.mock('@/app-layer/events/audit', () => ({ __esModule: true, logEvent: jest.fn() }));

import { exportAuditPackToSharePoint } from '@/app-layer/usecases/audit-pack-sharepoint-export';

const admin = { tenantId: 't1', userId: 'u1', permissions: { canAdmin: true } } as any;
const reader = { tenantId: 't1', userId: 'u2', permissions: { canAdmin: false } } as any;

beforeEach(() => {
    jest.clearAllMocks();
    mockGetPack.mockResolvedValue({ id: 'p1', name: 'Q2 Audit', status: 'FROZEN', frozenAt: new Date('2026-01-01'), items: [{}, {}] });
    mockExport.mockImplementation((_ctx: any, _id: string, fmt: string) =>
        fmt === 'csv' ? { csv: 'Type,Id\n' } : { pack: { id: 'p1' }, items: [] },
    );
    mockClient.uploadNewFile.mockResolvedValue({ id: 'sp-item-1', webUrl: 'https://sp/pack.zip' });
    mockDb.auditPack.update.mockResolvedValue({});
    mockDb.integrationExecution.create.mockResolvedValue({});
});

describe('exportAuditPackToSharePoint', () => {
    it('rejects a non-admin', async () => {
        await expect(exportAuditPackToSharePoint(reader, 'p1', { driveId: 'd1' })).rejects.toBeDefined();
    });

    it('refuses a non-FROZEN pack', async () => {
        mockGetPack.mockResolvedValueOnce({ id: 'p1', name: 'x', status: 'DRAFT', items: [] });
        await expect(exportAuditPackToSharePoint(admin, 'p1', { driveId: 'd1' })).rejects.toThrow(/FROZEN/);
    });

    it('uploads a ZIP + records the export on the pack and an execution', async () => {
        const r = await exportAuditPackToSharePoint(admin, 'p1', { driveId: 'd1' }, { now: () => new Date('2026-06-09T00:00:00Z') });
        expect(r).toEqual({ spItemId: 'sp-item-1', webUrl: 'https://sp/pack.zip' });

        // Uploaded a .zip to the drive root with a templated name.
        const [driveId, folderId, name, , contentType] = mockClient.uploadNewFile.mock.calls[0];
        expect(driveId).toBe('d1');
        expect(folderId).toBe('root');
        expect(name).toBe('Q2-Audit-2026-06-09.zip');
        expect(contentType).toBe('application/zip');

        // Recorded on the pack + an IntegrationExecution.
        expect(mockDb.auditPack.update.mock.calls[0][0].data).toMatchObject({ spExportItemId: 'sp-item-1' });
        expect(mockDb.integrationExecution.create.mock.calls[0][0].data).toMatchObject({
            provider: 'sharepoint',
            automationKey: 'sharepoint.audit_pack_export',
            status: 'PASSED',
        });
    });

    it('requires a driveId', async () => {
        await expect(exportAuditPackToSharePoint(admin, 'p1', { driveId: '' })).rejects.toBeDefined();
    });
});
