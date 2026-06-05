/**
 * @jest-environment jsdom
 *
 * Locks the CSP fix: in the browser, `src/lib/zod-jitless` must set Zod's
 * `jitless` flag so Zod never runs its `new Function("")` eval-capability
 * probe — which our strict production CSP (no `unsafe-eval`) blocks and
 * reports as a console violation on every page. Zod still validates
 * correctly under the interpreted (jitless) path.
 */
import { z } from 'zod';

describe('zod-jitless (browser)', () => {
    it('sets jitless on the global Zod config when a window exists', async () => {
        expect(typeof window).toBe('object');
        await import('@/lib/zod-jitless');
        // config() with no args returns the live global config object.
        expect(z.config().jitless).toBe(true);
    });

    it('Zod still validates correctly under jitless', async () => {
        await import('@/lib/zod-jitless');
        const schema = z.object({ name: z.string(), n: z.number() });
        expect(schema.parse({ name: 'x', n: 1 })).toEqual({ name: 'x', n: 1 });
        expect(() => schema.parse({ name: 'x', n: 'no' })).toThrow();
    });
});
