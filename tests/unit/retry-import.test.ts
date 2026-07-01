/**
 * Unit tests for retryImport — the transient-chunk-load retry wrapper used
 * to make ssr:false `dynamic()` views self-heal on a flaky chunk fetch.
 */
import { retryImport } from '@/lib/retry-import';

describe('retryImport', () => {
    it('resolves on the first try when the import succeeds', async () => {
        const factory = jest.fn().mockResolvedValue('ok');
        const value = await retryImport(factory)();
        expect(value).toBe('ok');
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure and eventually resolves', async () => {
        const factory = jest
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValue('recovered');
        // Tiny base delay so the backoff waits don't slow the test.
        const value = await retryImport(factory, 3, 1)();
        expect(value).toBe('recovered');
        expect(factory).toHaveBeenCalledTimes(3);
    });

    it('rejects with the original error once retries are exhausted', async () => {
        const err = new TypeError('Failed to fetch');
        const factory = jest.fn().mockRejectedValue(err);
        await expect(retryImport(factory, 2, 1)()).rejects.toBe(err);
        // original + 2 retries = 3 attempts
        expect(factory).toHaveBeenCalledTimes(3);
    });

    it('does not retry when retries is 0 (a genuine error is not masked)', async () => {
        const err = new Error('boom');
        const factory = jest.fn().mockRejectedValue(err);
        await expect(retryImport(factory, 0, 1)()).rejects.toBe(err);
        expect(factory).toHaveBeenCalledTimes(1);
    });
});
