/**
 * Unit tests for the minor-version cap (scripts/lib/minor-cap.mjs) and
 * the semantic-release plugin wrapper (scripts/semrel-minor-cap.mjs).
 *
 * The pure decision logic is exercised through a Node subprocess: the
 * plugin's sibling import (@semantic-release/commit-analyzer) is
 * ESM-only, so importing it inside jest's CJS world is brittle. The
 * subprocess (`node --input-type=module`) evaluates the real modules
 * exactly as semantic-release will at release time.
 *
 * RUN: npx jest tests/unit/minor-cap.test.ts
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(__dirname, '..', '..');
const CAP_MOD = pathToFileURL(path.join(ROOT, 'scripts/lib/minor-cap.mjs')).href;
const PLUGIN_MOD = pathToFileURL(path.join(ROOT, 'scripts/semrel-minor-cap.mjs')).href;

type Case = { base: string | null; last: string };

/** Evaluate capMinor(base, last) for each case in a real ESM subprocess. */
function decide(cases: Case[]): Array<string | null> {
    const script = `
        const cases = JSON.parse(process.env.CASES);
        const { capMinor } = await import(process.env.MOD);
        process.stdout.write(JSON.stringify(cases.map((c) => capMinor(c.base, c.last)))); `;
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, CASES: JSON.stringify(cases), MOD: CAP_MOD },
    });
    if (res.status !== 0) {
        throw new Error(`capMinor subprocess failed (status ${res.status}):\n${res.stderr}`);
    }
    return JSON.parse(res.stdout);
}

describe('capMinor — minor-version cap decision', () => {
    it('promotes a minor bump to major only when it would push the minor to 1000', () => {
        const [
            patchAt999,
            minorAt999,
            minorAt998,
            majorAt999,
            noRelease,
            recursAt2999,
            minorEarly,
        ] = decide([
            { base: 'patch', last: '1.999.4' }, // patch never touches the minor
            { base: 'minor', last: '1.999.4' }, // would be 1.1000.0 → roll major
            { base: 'minor', last: '1.998.0' }, // 999 is allowed (three digits)
            { base: 'major', last: '1.999.0' }, // already a major
            { base: null, last: '1.999.0' }, // no release
            { base: 'minor', last: '2.999.7' }, // rollover recurs per major line
            { base: 'minor', last: '1.5.0' }, // ordinary minor bump
        ]);

        expect(patchAt999).toBe('patch');
        expect(minorAt999).toBe('major');
        expect(minorAt998).toBe('minor');
        expect(majorAt999).toBe('major');
        expect(noRelease).toBeNull();
        expect(recursAt2999).toBe('major');
        expect(minorEarly).toBe('minor');
    });

    it('does not promote when the last version is unknown/malformed (fails open to minor)', () => {
        const [emptyLast, garbage] = decide([
            { base: 'minor', last: '' },
            { base: 'minor', last: 'not-a-version' },
        ]);
        // A missing/unparseable minor must NOT force a spurious major bump.
        expect(emptyLast).toBe('minor');
        expect(garbage).toBe('minor');
    });

    it('exposes MINOR_CAP = 999', () => {
        const res = spawnSync(
            process.execPath,
            ['--input-type=module', '-e', `const m = await import(process.env.MOD); process.stdout.write(String(m.MINOR_CAP));`],
            { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MOD: CAP_MOD } },
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toBe('999');
    });
});

describe('semrel-minor-cap plugin wiring', () => {
    it('loads and exports an analyzeCommits function (commit-analyzer import resolves)', () => {
        const res = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `const m = await import(process.env.MOD); process.stdout.write(typeof m.analyzeCommits);`,
            ],
            { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MOD: PLUGIN_MOD } },
        );
        if (res.status !== 0) {
            throw new Error(`plugin import failed:\n${res.stderr}`);
        }
        expect(res.stdout).toBe('function');
    });
});
