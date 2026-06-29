/**
 * Unit coverage for the antivirus scanner entrypoints that the existing
 * `av-scan.test.ts` (download-gate only) leaves untested:
 *   - `scanBuffer` with no host (disabled → CLEAN, otherwise ERROR)
 *   - `scanBuffer` against an unreachable host (socket error → ERROR)
 *   - `scanStream` collect + too-large bound
 *   - `isClamavAvailable` (no host + unreachable host)
 *
 * The ClamAV INSTREAM success / infected parse branches need a live
 * clamd daemon and are intentionally not exercised.
 *
 * `@/env` is mocked because the env snapshot is captured at import
 * time; the mock object is mutated per test.
 */
import { Readable } from 'stream';

// Mutated per test; the factory reads the live reference.
const mockEnv: { AV_SCAN_MODE: string; CLAMAV_HOST: string | undefined } = {
    AV_SCAN_MODE: 'strict',
    CLAMAV_HOST: undefined,
};
jest.mock('@/env', () => ({ env: mockEnv }));

import {
    scanBuffer,
    scanStream,
    isClamavAvailable,
} from '@/lib/storage/av-scan';

beforeEach(() => {
    mockEnv.AV_SCAN_MODE = 'strict';
    mockEnv.CLAMAV_HOST = undefined;
});

describe('scanBuffer — ClamAV not configured', () => {
    it('returns CLEAN/disabled when scanning is disabled', async () => {
        mockEnv.AV_SCAN_MODE = 'disabled';
        const result = await scanBuffer(Buffer.from('hello'));
        expect(result.status).toBe('CLEAN');
        expect(result.engine).toBe('disabled');
        expect(result.durationMs).toBe(0);
        expect(result.rawOutput).toMatch(/disabled/i);
    });

    it('returns ERROR/none when not configured but scanning is required', async () => {
        mockEnv.AV_SCAN_MODE = 'strict';
        const result = await scanBuffer(Buffer.from('hello'));
        expect(result.status).toBe('ERROR');
        expect(result.engine).toBe('none');
        expect(result.rawOutput).toMatch(/not configured/i);
    });
});

describe('scanBuffer — unreachable ClamAV host', () => {
    it('resolves ERROR on socket error (default port path)', async () => {
        // Bare host (no port) exercises the default-port branch in
        // parseClamavHost; nothing listens → connection error.
        mockEnv.CLAMAV_HOST = '127.0.0.1';
        const result = await scanBuffer(Buffer.from('payload-bytes'));
        expect(result.status).toBe('ERROR');
        expect(result.engine).toBe('clamav');
    });

    it('resolves ERROR on socket error (explicit port path)', async () => {
        // 127.0.0.1:1 — nothing listening → ECONNREFUSED → error handler.
        mockEnv.CLAMAV_HOST = '127.0.0.1:1';
        const result = await scanBuffer(Buffer.alloc(64, 7));
        expect(result.status).toBe('ERROR');
        expect(result.engine).toBe('clamav');
    });
});

describe('scanStream', () => {
    it('collects a small stream and delegates to scanBuffer', async () => {
        mockEnv.AV_SCAN_MODE = 'disabled';
        const stream = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
        const result = await scanStream(stream);
        expect(result.status).toBe('CLEAN');
        expect(result.engine).toBe('disabled');
    });

    it('coerces non-buffer chunks then delegates', async () => {
        mockEnv.AV_SCAN_MODE = 'disabled';
        // string chunks → Buffer.from path inside scanStream.
        const stream = Readable.from(['ab', 'cd']);
        const result = await scanStream(stream);
        expect(result.status).toBe('CLEAN');
    });

    it('returns ERROR when the stream exceeds maxBytes', async () => {
        const stream = Readable.from([Buffer.alloc(10), Buffer.alloc(10)]);
        const result = await scanStream(stream, 5);
        expect(result.status).toBe('ERROR');
        expect(result.rawOutput).toMatch(/too large/i);
    });
});

describe('isClamavAvailable', () => {
    it('returns false when no host is configured', async () => {
        mockEnv.CLAMAV_HOST = undefined;
        await expect(isClamavAvailable()).resolves.toBe(false);
    });

    it('returns false when the host is unreachable', async () => {
        mockEnv.CLAMAV_HOST = '127.0.0.1:1';
        await expect(isClamavAvailable()).resolves.toBe(false);
    });
});
