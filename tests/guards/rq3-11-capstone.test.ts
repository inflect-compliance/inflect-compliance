/**
 * RQ3-11 — Capstone ratchet.
 *
 * The capstone doc (`docs/rq3-roadmap-complete.md`) is the architecture
 * record for the RQ3 wave. This ratchet pins the discoverability
 * contract: every RQ3 implementation note AND every RQ3 guard test
 * gets named in the capstone's cohort table.
 *
 * Why this matters: a future RQ3 follow-up that ships code without
 * threading itself into the capstone leaves a dangling decision that
 * the index promised would be findable from one URL. CI catches the
 * gap — the PR either adds itself to the table or removes its
 * implementation note + ratchet (deliberate retirement) in the same
 * diff.
 *
 * The check is conservative — it only enforces presence, not the
 * exact row content. A doc-tightening PR can move things around as
 * long as every note + ratchet filename still appears somewhere in
 * the doc.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const CAPSTONE_PATH = 'docs/rq3-roadmap-complete.md';
const NOTES_DIR = 'docs/implementation-notes';
const GUARDS_DIR = 'tests/guards';

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

function listFiles(dir: string, pattern: RegExp): string[] {
    return fs
        .readdirSync(path.join(ROOT, dir))
        .filter((f) => pattern.test(f))
        .sort();
}

describe('RQ3-11 — the capstone is the index', () => {
    test('the capstone doc exists at the canonical path', () => {
        expect(() => fs.statSync(path.join(ROOT, CAPSTONE_PATH))).not.toThrow();
    });

    test('the capstone names every RQ3 implementation note', () => {
        const capstone = read(CAPSTONE_PATH);
        const notes = listFiles(NOTES_DIR, /^2026-06-(11|12|13)-rq3-.*\.md$/).filter(
            // The capstone's OWN implementation note is excluded — the
            // capstone indexes the cohort, it doesn't index itself.
            // (Symmetric with the ratchet-test exclusion below.)
            (f) => f !== '2026-06-13-rq3-11-capstone.md',
        );
        // We expect at least the documented cohort.
        expect(notes.length).toBeGreaterThan(0);
        const missing = notes.filter((note) => !capstone.includes(note));
        if (missing.length > 0) {
            throw new Error(
                `Capstone (${CAPSTONE_PATH}) is missing implementation-note links for:\n  - ` +
                    missing.join('\n  - ') +
                    `\nAdd each to the cohort table, or delete the note in the same diff.`,
            );
        }
    });

    test('the capstone names every RQ3 ratchet test', () => {
        const capstone = read(CAPSTONE_PATH);
        const ratchets = listFiles(GUARDS_DIR, /^rq3-.*\.test\.ts$/).filter(
            // The capstone itself is excluded (this file would otherwise
            // self-reference and the ratchet would always pass trivially).
            (f) => f !== 'rq3-11-capstone.test.ts',
        );
        expect(ratchets.length).toBeGreaterThan(0);
        const missing = ratchets.filter((file) => !capstone.includes(file));
        if (missing.length > 0) {
            throw new Error(
                `Capstone (${CAPSTONE_PATH}) is missing ratchet references for:\n  - ` +
                    missing.join('\n  - ') +
                    `\nAdd each to the cohort table.`,
            );
        }
    });

    test('the capstone carries the three load-bearing section headings', () => {
        const capstone = read(CAPSTONE_PATH);
        // The narrative + decisions + extension sections are the doc's
        // structure. A "tidy-up" that strips one of them weakens the
        // architecture record beyond a ratchetable contract.
        expect(capstone).toMatch(/## The thesis/);
        expect(capstone).toMatch(/## The cohort/);
        expect(capstone).toMatch(/## The load-bearing decisions/);
        expect(capstone).toMatch(/## How to extend this/);
    });
});
