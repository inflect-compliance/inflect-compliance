/**
 * No `useSession()` in app/client code.
 *
 * The app deliberately mounts NO `<SessionProvider>` (session is resolved
 * server-side and threaded through the tenant context / props). NextAuth's
 * `useSession()` therefore returns `undefined` at runtime and throws on
 * destructure — exactly the "W.useSession() is undefined" prod crash that hit
 * the control page (AutomationSuggestionsRail).
 *
 * Client components needing the current user id use `useCurrentUserId()` from
 * `@/lib/tenant-context-provider`. This guard is the GENERAL backstop (the
 * earlier r14 guards only covered tenant-switcher + user-menu).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = path.resolve(__dirname, '../../src');

function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
}

describe('no useSession() — the app has no SessionProvider', () => {
    it('no src file imports useSession from next-auth/react', () => {
        const offenders = walk(SRC).filter((f) => {
            const src = fs.readFileSync(f, 'utf8');
            return /import[^;]*\buseSession\b[^;]*from\s*['"]next-auth\/react['"]/.test(src);
        });
        expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
    });
});
