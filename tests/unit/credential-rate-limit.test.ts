/**
 * Per-identifier credential rate limit — memory-fallback behaviour.
 *
 * Covers the contract the chokepoint relies on:
 *   - First N attempts under the sliding window pass
 *   - N+1 is blocked with a positive retryAfterSeconds
 *   - reset() lets a user through again immediately
 *   - AUTH_TEST_MODE=1 short-circuits the gate (E2E-test invariant)
 *   - RATE_LIMIT_ENABLED=0 also short-circuits (ops kill switch)
 *
 * No Upstash in this file — the memory fallback is what CI uses and
 * what dev uses. The Upstash path is exercised in integration.
 */

const mockEnv: Record<string, string | undefined> = {
    RATE_LIMIT_MODE: 'memory',
    RATE_LIMIT_ENABLED: '1',
    AUTH_TEST_MODE: undefined,
};
jest.mock('@/env', () => ({
    __esModule: true,
    env: new Proxy(mockEnv, {
        get: (t, p: string) => t[p as string],
    }),
}));

import {
    CREDENTIALS_RATE_LIMIT,
    __resetCredentialsRateLimitForTests,
    checkCredentialsAttempt,
    resetCredentialsBackoff,
} from '@/lib/auth/credential-rate-limit';

beforeEach(() => {
    __resetCredentialsRateLimitForTests();
    mockEnv.RATE_LIMIT_MODE = 'memory';
    mockEnv.RATE_LIMIT_ENABLED = '1';
    mockEnv.AUTH_TEST_MODE = undefined;
});

describe('checkCredentialsAttempt — memory fallback', () => {
    const EMAIL = 'alice@example.com';

    it(`allows the first ${CREDENTIALS_RATE_LIMIT.maxAttempts} attempts in the window`, async () => {
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts; i++) {
            const r = await checkCredentialsAttempt(EMAIL);
            expect(r).toEqual({ ok: true });
        }
    });

    it(`blocks attempt ${CREDENTIALS_RATE_LIMIT.maxAttempts + 1} with a positive retryAfterSeconds`, async () => {
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts; i++) {
            await checkCredentialsAttempt(EMAIL);
        }
        const blocked = await checkCredentialsAttempt(EMAIL);
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) {
            expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
            expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(
                CREDENTIALS_RATE_LIMIT.windowSeconds,
            );
        }
    });

    it('keeps separate buckets per email (case-insensitive)', async () => {
        // Saturate the bucket for one email…
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts; i++) {
            await checkCredentialsAttempt('one@example.com');
        }
        // …and a different email still has headroom.
        const r = await checkCredentialsAttempt('two@example.com');
        expect(r).toEqual({ ok: true });
    });

    it('normalises case + whitespace — same email hits the same bucket', async () => {
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts; i++) {
            await checkCredentialsAttempt('  MixedCase@Example.COM  ');
        }
        const r = await checkCredentialsAttempt('mixedcase@example.com');
        expect(r.ok).toBe(false);
    });

    it('resetCredentialsBackoff clears the counter so the user can retry immediately', async () => {
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts; i++) {
            await checkCredentialsAttempt(EMAIL);
        }
        const blocked = await checkCredentialsAttempt(EMAIL);
        expect(blocked.ok).toBe(false);

        await resetCredentialsBackoff(EMAIL);

        const after = await checkCredentialsAttempt(EMAIL);
        expect(after).toEqual({ ok: true });
    });
});

describe('resetCredentialsBackoff — Upstash DEL', () => {
    // Build a chainable Redis mock that captures what the module
    // calls without needing an actual Upstash instance. The
    // `Ratelimit.limit` wrapper just needs to resolve to a "success"
    // shape; reset just needs the `del` channel.
    const mockDel = jest.fn().mockResolvedValue(1);
    const mockLimit = jest
        .fn()
        .mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

    beforeEach(() => {
        mockDel.mockClear();
        mockLimit.mockClear();
        jest.resetModules();
        jest.doMock('@upstash/redis', () => ({
            Redis: { fromEnv: () => ({ del: mockDel }) },
        }));
        jest.doMock('@upstash/ratelimit', () => ({
            Ratelimit: Object.assign(
                function () {
                    return { limit: mockLimit };
                },
                { slidingWindow: () => ({}) },
            ),
        }));
        mockEnv.RATE_LIMIT_MODE = 'upstash';
    });

    afterEach(() => {
        jest.dontMock('@upstash/redis');
        jest.dontMock('@upstash/ratelimit');
        mockEnv.RATE_LIMIT_MODE = 'memory';
    });

    it('fires `redis.del(key)` against Upstash on reset', async () => {
        const fresh = await import('@/lib/auth/credential-rate-limit');
        fresh.__resetCredentialsRateLimitForTests();

        // One attempt to bootstrap initLimiter() — that's when the
        // mocked Redis singleton lands inside the module.
        await fresh.checkCredentialsAttempt('alice@example.com');
        expect(mockLimit).toHaveBeenCalledTimes(1);

        await fresh.resetCredentialsBackoff('alice@example.com');
        expect(mockDel).toHaveBeenCalledTimes(1);
        // The key shape is the documented `rl:cred:id:<sha256(email)>`.
        expect(mockDel.mock.calls[0][0]).toMatch(/^rl:cred:id:[0-9a-f]{64}$/);
    });

    it('reset fails open if Redis throws — memory bucket still cleared', async () => {
        mockDel.mockRejectedValueOnce(new Error('upstash blip'));
        const fresh = await import('@/lib/auth/credential-rate-limit');
        fresh.__resetCredentialsRateLimitForTests();
        await fresh.checkCredentialsAttempt('bob@example.com');

        // The Redis call inside reset should reject, but the function
        // resolves cleanly — better to let a successful login through
        // than to 500 on a Redis blip.
        await expect(
            fresh.resetCredentialsBackoff('bob@example.com'),
        ).resolves.toBeUndefined();
        expect(mockDel).toHaveBeenCalledTimes(1);
    });
});

describe('checkCredentialsAttempt — kill switches', () => {
    it('AUTH_TEST_MODE=1 bypasses the gate regardless of attempt count', async () => {
        mockEnv.AUTH_TEST_MODE = '1';
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts + 5; i++) {
            const r = await checkCredentialsAttempt('spam@example.com');
            expect(r).toEqual({ ok: true });
        }
    });

    it('RATE_LIMIT_ENABLED=0 bypasses the gate regardless of attempt count', async () => {
        mockEnv.RATE_LIMIT_ENABLED = '0';
        for (let i = 0; i < CREDENTIALS_RATE_LIMIT.maxAttempts + 5; i++) {
            const r = await checkCredentialsAttempt('spam@example.com');
            expect(r).toEqual({ ok: true });
        }
    });
});
