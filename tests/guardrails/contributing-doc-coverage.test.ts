/**
 * Structural ratchet — CONTRIBUTING.md (developer onboarding guide).
 *
 * Keeps the onboarding guide structurally intact and honest:
 *   - the file exists,
 *   - it carries all 9 canonical H2 sections (exact match),
 *   - its "Read these next" curated list is exactly 8 entries, each
 *     pointing at a file that actually exists,
 *   - README.md and CLAUDE.md both cross-link to it (so a new
 *     contributor lands here from either entry point).
 *
 * See CONTRIBUTING.md and
 * docs/implementation-notes/2026-06-25-contributing-guide.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8') : '';

const doc = read('CONTRIBUTING.md');

const REQUIRED_H2 = [
    '## Before you start',
    '## Local dev loop',
    '## How the codebase is organized',
    '## Your first PR — a working example',
    '## CI signals + how to debug them',
    '## The contracts you cannot break',
    '## Read these next',
    '## When something goes wrong — escalation paths',
    '## Common gotchas',
];

describe('CONTRIBUTING.md onboarding guide', () => {
    it('exists', () => {
        expect(doc.length).toBeGreaterThan(0);
    });

    it('has all 9 canonical H2 sections (exact headings)', () => {
        const missing = REQUIRED_H2.filter((h) => !doc.includes(`\n${h}\n`));
        expect(missing).toEqual([]);
    });

    it('"Read these next" lists exactly 8 entries, each pointing at an existing file', () => {
        // Isolate the section body (up to the next H2).
        const m = doc.match(/##\s+Read these next\n([\s\S]*?)\n##\s/);
        expect(m).not.toBeNull();
        const body = m![1];
        // Every markdown link target in the section is a curated read.
        const targets = [...body.matchAll(/\]\(([^)]+)\)/g)].map((x) => x[1]);
        expect(targets.length).toBe(8);
        for (const t of targets) {
            const file = t.split('#')[0]; // strip any anchor
            expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
        }
    });

    it('README.md cross-links to CONTRIBUTING.md', () => {
        expect(read('README.md')).toContain('CONTRIBUTING.md');
    });

    it('CLAUDE.md cross-links to CONTRIBUTING.md', () => {
        expect(read('CLAUDE.md')).toContain('CONTRIBUTING.md');
    });
});
