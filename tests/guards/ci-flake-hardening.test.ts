/**
 * CI flake-hardening ratchet (2026-06-18).
 *
 * Locks two fixes for recurring CI flakes that repeatedly cancelled
 * otherwise-green PRs:
 *
 *   1. `concurrency.cancel-in-progress` must NOT be a bare `true`. A PR's
 *      `synchronize` fires when its merge-ref is recomputed (e.g. `main`
 *      advancing via semantic-release's per-merge release commit) WITHOUT a
 *      new PR commit; bare cancel-in-progress then killed the still-in-flight
 *      Build/Docker job while finished siblings stayed green. It must be the
 *      PR-aware expression that only cancels for push events.
 *   2. The Build + Docker Build jobs must keep headroom over their observed
 *      durations so a slow-but-fine cold build isn't cancelled as a timeout.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CI = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/ci.yml'),
    'utf8',
);

/** First `timeout-minutes` after a job's `name:` line. */
function jobTimeout(jobName: string): number {
    const re = new RegExp(
        `name: ${jobName}\\b[\\s\\S]{0,900}?timeout-minutes:\\s*(\\d+)`,
    );
    const m = CI.match(re);
    if (!m) throw new Error(`no timeout-minutes found for job "${jobName}"`);
    return Number(m[1]);
}

describe('CI flake hardening', () => {
    it('cancel-in-progress is PR-aware (not a bare true) so base-recompute synchronizes do not cancel PR runs', () => {
        expect(CI).toMatch(/cancel-in-progress:/);
        expect(CI).not.toMatch(/cancel-in-progress:\s*true\s*$/m);
        expect(CI).toMatch(
            /cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*!=\s*'pull_request'\s*\}\}/,
        );
    });

    it('the Build job has cold-runner headroom (>= 15 min)', () => {
        expect(jobTimeout('Build')).toBeGreaterThanOrEqual(15);
    });

    it('the Docker Build job has headroom for a cold npm-ci layer (>= 40 min)', () => {
        expect(jobTimeout('Docker Build')).toBeGreaterThanOrEqual(40);
    });
});
