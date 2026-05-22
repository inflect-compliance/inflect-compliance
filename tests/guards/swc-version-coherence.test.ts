/**
 * Structural ratchet — Next.js SWC version coherence.
 *
 * REGRESSION CLASS
 * ----------------
 * `package.json` once carried an explicit `optionalDependencies`
 * block pinning all nine `@next/swc-*` platform binaries — eight to
 * the stale Next-14 version `14.2.35`, one (`linux-arm64-musl`) to
 * `16.2.6`. The result: the host whose platform package was pinned
 * correctly built with the right SWC, every other platform resolved
 * a Next-14 SWC against a Next-16 runtime — silent cross-platform
 * build drift. #615 removed the block (a consumer must NEVER pin
 * `next`'s own transitive `@next/swc-*` packages — `next` resolves
 * them itself, all at its own version).
 *
 * This guard makes that non-negotiable structurally:
 *
 *   1. `package.json` must not pin any `@next/swc-*` package in
 *      `optionalDependencies` (or `dependencies`) — re-introducing
 *      such a pin is the exact mechanism that caused the skew.
 *   2. Every `@next/swc-*` entry in `package-lock.json` must carry
 *      the SAME version as `next` itself. A skew of any shape —
 *      partial pin, a stale lockfile edit — fails here.
 *
 * Pure static analysis — reads `package.json` + `package-lock.json`,
 * no install, no DB.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const readJson = (rel: string) =>
    JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const SWC_RE = /^(@next\/swc-|node_modules\/@next\/swc-)/;

describe('Next.js SWC version coherence', () => {
    const pkg = readJson('package.json');
    const lock = readJson('package-lock.json');

    it('package.json does not pin any @next/swc-* package itself', () => {
        // `@next/swc-*` are `next`'s OWN transitive optional deps. A
        // consumer pinning them is what produced the 14.2.35 / 16.2.6
        // skew — `next` must own their version.
        const offenders: string[] = [];
        for (const block of ['dependencies', 'devDependencies', 'optionalDependencies']) {
            const deps = pkg[block] as Record<string, string> | undefined;
            if (!deps) continue;
            for (const name of Object.keys(deps)) {
                if (SWC_RE.test(name)) offenders.push(`${block}.${name}`);
            }
        }
        if (offenders.length > 0) {
            throw new Error(
                `package.json pins @next/swc-* directly:\n` +
                    offenders.map((o) => `  - ${o}`).join('\n') +
                    `\n\nRemove it. next@<version> resolves its own @next/swc-* ` +
                    `packages — pinning them desynchronises platforms from next.`,
            );
        }
    });

    it('every @next/swc-* in the lockfile matches the resolved next version', () => {
        const nextEntry = lock.packages?.['node_modules/next'];
        expect(nextEntry?.version).toBeDefined();
        const nextVersion: string = nextEntry.version;

        const skew: string[] = [];
        for (const [key, entry] of Object.entries(
            lock.packages as Record<string, { version?: string }>,
        )) {
            if (!SWC_RE.test(key)) continue;
            // Stub entries (no version) and full entries alike must,
            // when versioned, equal next's version.
            if (entry.version && entry.version !== nextVersion) {
                skew.push(`${key}: ${entry.version} (next is ${nextVersion})`);
            }
        }
        if (skew.length > 0) {
            throw new Error(
                `@next/swc-* version skew vs next@${nextVersion}:\n` +
                    skew.map((s) => `  - ${s}`).join('\n') +
                    `\n\nEvery @next/swc-* platform package must track the ` +
                    `installed next version, or platforms build with ` +
                    `mismatched SWC. Re-run npm install to realign.`,
            );
        }
        // Sanity: the lockfile actually contains SWC entries (so this
        // test is not silently vacuous).
        const swcCount = Object.keys(lock.packages).filter((k) => SWC_RE.test(k)).length;
        expect(swcCount).toBeGreaterThan(0);
    });

    it('detects a skewed @next/swc-* entry (regression proof)', () => {
        const nextVersion: string = lock.packages['node_modules/next'].version;
        const sabotaged = { 'node_modules/@next/swc-linux-x64-gnu': { version: '14.2.35' } };
        const skewed = Object.entries(sabotaged).filter(
            ([, v]) => v.version !== nextVersion,
        );
        expect(skewed).toHaveLength(1);
    });
});
