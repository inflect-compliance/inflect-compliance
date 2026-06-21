/**
 * No stale root artefacts — tracked-files invariant.
 *
 * Six transient debugger / redirect outputs were once committed to the repo
 * root and deleted (see docs/implementation-notes/2026-06-21-stale-root-cleanup.md):
 *   - `nul`                    — a Windows `> nul` redirect mistake
 *   - `next_error*.html`       — saved Next.js error-overlay HTML
 *   - `playwright-results*.json` — ad-hoc Playwright JSON reporter dumps
 *
 * They are now `.gitignore`d, but ignore rules don't protect against a
 * `git add -f` or a rule regressing. This guard mirrors the GAP-16
 * filename-guard in `tests/guardrails/no-secrets.test.ts`: enumerate tracked
 * files via `git ls-files` and fail if any matches the forbidden globs.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');

// Each pattern matches against a file's basename. `nul` is exact; the others
// are prefix/suffix globs covering the numbered variants (next_error2.html,
// playwright-results3.json, …).
const FORBIDDEN: { label: string; match: (base: string) => boolean }[] = [
    { label: 'nul', match: (b) => b === 'nul' },
    {
        label: 'next_error*.html',
        match: (b) => b.startsWith('next_error') && b.endsWith('.html'),
    },
    {
        label: 'playwright-results*.json',
        match: (b) => b.startsWith('playwright-results') && b.endsWith('.json'),
    },
];

function trackedFiles(): string[] {
    return execFileSync('git', ['ls-files', '-z'], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
    })
        .split('\0')
        .filter(Boolean);
}

describe('No stale root artefacts in the git index', () => {
    it('no tracked file matches the forbidden artefact globs', () => {
        const tracked = trackedFiles();
        const violations: string[] = [];
        for (const file of tracked) {
            const base = file.split('/').pop() ?? file;
            for (const rule of FORBIDDEN) {
                if (rule.match(base)) {
                    violations.push(`${file}  (matches ${rule.label})`);
                }
            }
        }

        if (violations.length > 0) {
            throw new Error(
                'Stale root artefacts detected in the git index:\n' +
                    violations.map((v) => `  ${v}`).join('\n') +
                    '\n\nThese are transient debugger / redirect outputs — delete them ' +
                    '(`git rm`) and rely on the .gitignore rules. See ' +
                    'docs/implementation-notes/2026-06-21-stale-root-cleanup.md.',
            );
        }
        expect(violations).toEqual([]);
    });

    it('the forbidden matchers actually catch the known artefact names', () => {
        // Guards the guard: a future refactor of `FORBIDDEN` must keep
        // matching the six names this ratchet was created to forbid.
        const known = [
            'nul',
            'next_error.html',
            'next_error2.html',
            'playwright-results.json',
            'playwright-results2.json',
            'playwright-results3.json',
        ];
        for (const name of known) {
            const caught = FORBIDDEN.some((r) => r.match(name));
            expect(caught).toBe(true);
        }
        // And it must NOT flag legitimate files.
        for (const ok of ['index.html', 'results.json', 'annul.ts', 'nullable.ts']) {
            expect(FORBIDDEN.some((r) => r.match(ok))).toBe(false);
        }
    });
});
