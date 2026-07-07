/**
 * PR-5 — device posture checks (null→NOT_APPLICABLE), device-token auth
 * (generate/hash/verify), report + token-lifecycle usecases, device provider.
 */
jest.mock('@/lib/prisma', () => ({
    prisma: {
        tenantDeviceToken: { findUnique: jest.fn(), update: jest.fn() },
        tenant: { findUnique: jest.fn() },
        device: { findMany: jest.fn() },
    },
    default: { tenantDeviceToken: {}, tenant: {}, device: {} },
}));
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(mockDb)),
}));
jest.mock('@/lib/observability/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));

import { runDeviceCheck, type CheckDevice } from '@/app-layer/integrations/providers/device/checks';
import { DeviceProvider } from '@/app-layer/integrations/providers/device';
import { generateDeviceToken, hashDeviceToken, verifyDeviceToken } from '@/lib/auth/device-token-auth';
import { reportDevice, issueDeviceToken, revokeDeviceToken, listDevices } from '@/app-layer/usecases/device';
import { prisma } from '@/lib/prisma';
import { makeRequestContext } from '../helpers/make-context';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const mPrisma = prisma as unknown as { tenantDeviceToken: { findUnique: jest.Mock; update: jest.Mock }; tenant: { findUnique: jest.Mock } };

const mockDb = {
    // H3 — reportDevice checks findUnique + count (new-device cap) before upsert.
    device: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: 'existing' }), count: jest.fn().mockResolvedValue(0) },
    tenantDeviceToken: { create: jest.fn(), updateMany: jest.fn() },
};

function dev(over: Partial<CheckDevice>): CheckDevice {
    return { serialNumber: over.serialNumber ?? 'SN1', hostname: over.hostname ?? 'h1', platform: over.platform ?? 'MACOS', diskEncrypted: over.diskEncrypted ?? null, screenLockEnabled: over.screenLockEnabled ?? null, antivirusRunning: over.antivirusRunning ?? null, passwordManagerPresent: over.passwordManagerPresent ?? null };
}

describe('runDeviceCheck', () => {
    it('devices_encrypted FAILs a device with diskEncrypted=false', () => {
        const r = runDeviceCheck('devices_encrypted', [dev({ diskEncrypted: true }), dev({ diskEncrypted: false })], NOW);
        expect(r.status).toBe('FAILED');
        expect(r.details.failed).toBe(1);
        expect(r.details.passed).toBe(1);
    });

    it('null (NOT_APPLICABLE) is neither pass nor fail', () => {
        const r = runDeviceCheck('devices_screenlock', [dev({ screenLockEnabled: null }), dev({ screenLockEnabled: true })], NOW);
        expect(r.status).toBe('PASSED');
        expect(r.details.notApplicable).toBe(1);
        expect(r.details.passed).toBe(1);
        expect(r.details.failed).toBe(0);
    });

    it('all-null is NOT_APPLICABLE (H2 — no applicable population, never a false PASS)', () => {
        const r = runDeviceCheck('devices_antivirus', [dev({ antivirusRunning: null })], NOW);
        expect(r.status).toBe('NOT_APPLICABLE');
    });

    it('unknown check ERRORs', () => {
        expect(runDeviceCheck('nope', [], NOW).status).toBe('ERROR');
    });
});

describe('device-token auth', () => {
    it('generateDeviceToken → hashDeviceToken round-trips + prefix format', () => {
        const { plaintext, tokenHash, tokenPrefix } = generateDeviceToken();
        expect(plaintext.startsWith('icdt_')).toBe(true);
        expect(hashDeviceToken(plaintext)).toBe(tokenHash);
        expect(plaintext.startsWith(tokenPrefix)).toBe(true);
    });

    it('verifyDeviceToken rejects wrong format / not-found / revoked / expired', async () => {
        expect((await verifyDeviceToken('nope')).reason).toBe('invalid_format');
        mPrisma.tenantDeviceToken.findUnique.mockResolvedValueOnce(null);
        expect((await verifyDeviceToken('icdt_x')).reason).toBe('not_found');
        mPrisma.tenantDeviceToken.findUnique.mockResolvedValueOnce({ id: 't', tenantId: 'T', expiresAt: null, revokedAt: NOW });
        expect((await verifyDeviceToken('icdt_x')).reason).toBe('revoked');
        mPrisma.tenantDeviceToken.findUnique.mockResolvedValueOnce({ id: 't', tenantId: 'T', expiresAt: new Date('2020-01-01'), revokedAt: null });
        expect((await verifyDeviceToken('icdt_x', null, NOW)).reason).toBe('expired');
    });

    it('verifyDeviceToken accepts a live token + touches lastUsedAt', async () => {
        mPrisma.tenantDeviceToken.findUnique.mockResolvedValueOnce({ id: 'tok-1', tenantId: 'T1', expiresAt: null, revokedAt: null });
        mPrisma.tenantDeviceToken.update.mockResolvedValueOnce({});
        const r = await verifyDeviceToken('icdt_x', '1.2.3.4', NOW);
        expect(r).toMatchObject({ valid: true, tenantId: 'T1', tokenId: 'tok-1' });
        expect(mPrisma.tenantDeviceToken.update).toHaveBeenCalled();
    });
});

describe('device usecases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDb.device.upsert.mockResolvedValue({ id: 'd1', serialNumber: 'SN1' });
        mockDb.tenantDeviceToken.create.mockResolvedValue({ id: 'tk1', name: 'CI', tokenPrefix: 'icdt_abc', createdAt: NOW });
        mockDb.tenantDeviceToken.updateMany.mockResolvedValue({ count: 1 });
    });

    it('reportDevice upserts by (tenantId, serialNumber) with source AGENT', async () => {
        await reportDevice('T1', { serialNumber: 'SN1', platform: 'MACOS', diskEncrypted: true }, NOW);
        const call = mockDb.device.upsert.mock.calls[0][0];
        expect(call.where.tenantId_serialNumber).toEqual({ tenantId: 'T1', serialNumber: 'SN1' });
        expect(call.create.source).toBe('AGENT');
        expect(call.create.diskEncrypted).toBe(true);
    });

    it('H3 — reportDevice rejects a NEW device once the per-tenant cap is reached', async () => {
        mockDb.device.findUnique.mockResolvedValueOnce(null); // brand-new serial
        mockDb.device.count.mockResolvedValueOnce(10000); // at cap
        await expect(reportDevice('T1', { serialNumber: 'NEW', platform: 'MACOS' }, NOW)).rejects.toThrow(/limit reached/i);
        expect(mockDb.device.upsert).not.toHaveBeenCalled();
    });

    it('H3 — reportDevice still accepts a report for an EXISTING device at the cap', async () => {
        mockDb.device.findUnique.mockResolvedValueOnce({ id: 'existing' }); // known serial
        await reportDevice('T1', { serialNumber: 'SN1', platform: 'MACOS' }, NOW);
        expect(mockDb.device.count).not.toHaveBeenCalled(); // no cap check for updates
        expect(mockDb.device.upsert).toHaveBeenCalled();
    });

    it('issueDeviceToken returns a plaintext once (manage permission)', async () => {
        const ctx = makeRequestContext('ADMIN');
        const token = await issueDeviceToken(ctx, { name: 'CI' });
        expect(token.plaintext.startsWith('icdt_')).toBe(true);
        expect(mockDb.tenantDeviceToken.create).toHaveBeenCalled();
    });

    it('issueDeviceToken forbids a reader', async () => {
        const ctx = makeRequestContext('READER');
        await expect(issueDeviceToken(ctx, { name: 'CI' })).rejects.toThrow(/permission/i);
    });

    it('revokeDeviceToken sets revokedAt', async () => {
        const ctx = makeRequestContext('ADMIN');
        const r = await revokeDeviceToken(ctx, 'tk1', NOW);
        expect(r.revoked).toBe(true);
        expect(mockDb.tenantDeviceToken.updateMany.mock.calls[0][0].data.revokedAt).toBe(NOW);
    });

    it('listDevices is tenant-scoped', async () => {
        mockDb.device.findMany.mockResolvedValue([]);
        const ctx = makeRequestContext('READER');
        await listDevices(ctx);
        expect(mockDb.device.findMany.mock.calls[0][0].where.tenantId).toBe(ctx.tenantId);
    });
});

describe('DeviceProvider', () => {
    it('runCheck applies the check to injected devices', async () => {
        const provider = new DeviceProvider({ load: async () => [dev({ diskEncrypted: false })], now: () => NOW });
        const r = await provider.runCheck({ automationKey: 'device.devices_encrypted', parsed: { provider: 'device', checkType: 'devices_encrypted', raw: '' }, tenantId: 'T1', connectionConfig: {}, triggeredBy: 'scheduled' });
        expect(r.status).toBe('FAILED');
        expect(provider.supportedChecks).toContain('devices_encrypted');
    });
});
