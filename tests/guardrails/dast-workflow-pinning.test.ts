/**
 * Structural ratchet for the nightly DAST (ZAP Baseline) workflow.
 *
 * Locks the load-bearing properties of `.github/workflows/dast.yml` +
 * `.zap/rules.tsv` so a future edit can't silently:
 *   - delete the workflow / its schedule,
 *   - flip the scan blocking-vs-non-blocking without acknowledging the
 *     30-day sunset (the comment names the flip date), or
 *   - add a false-positive allowlist entry with no written reason.
 *
 * When the 30-day non-blocking window ends (2026-07-24) and the scan
 * flips to `fail_action: true`, update assertion #3 accordingly (the
 * follow-up task tracks this).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const DAST_YML = path.join(ROOT, '.github/workflows/dast.yml');
const RULES_TSV = path.join(ROOT, '.zap/rules.tsv');

describe('DAST workflow pinning', () => {
    it('the DAST workflow exists', () => {
        expect(fs.existsSync(DAST_YML)).toBe(true);
    });

    const yml = fs.existsSync(DAST_YML) ? fs.readFileSync(DAST_YML, 'utf-8') : '';

    it('runs on a nightly schedule (cron)', () => {
        expect(yml).toMatch(/schedule:/);
        expect(yml).toMatch(/-\s*cron:\s*'0 4 \* \* \*'/);
    });

    it('is non-blocking with a sunset date naming the flip to fail_action: true', () => {
        // The scan ships non-blocking; the comment must name when/what to flip.
        expect(yml).toMatch(/fail_action:\s*false/);
        const lines = yml.split('\n');
        const sunset = lines.some(
            (l) => /^\s*#/.test(l) && /\d{4}-\d{2}-\d{2}/.test(l) && /fail_action:\s*true/.test(l),
        );
        expect(sunset).toBe(true);
    });

    it('rules.tsv exists and every allowlist entry has a reason comment', () => {
        expect(fs.existsSync(RULES_TSV)).toBe(true);
        const lines = fs.readFileSync(RULES_TSV, 'utf-8').split('\n');
        const comments = lines.filter((l) => /^\s*#/.test(l));
        const ruleIds = lines
            .map((l) => l.match(/^(\d+)\t/)?.[1])
            .filter((x): x is string => Boolean(x));

        // At least the three seeded Next.js false-positives.
        expect(ruleIds.length).toBeGreaterThanOrEqual(3);

        // Every rule id must be named in some comment line (its reason).
        for (const id of ruleIds) {
            const explained = comments.some((c) => new RegExp(`\\b${id}\\b`).test(c));
            expect(explained).toBe(true);
        }
    });
});
