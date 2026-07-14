/**
 * Guardrail: coverage-evidence predicate unification (ep1 evidence review gate).
 *
 * ─── The invariant ──────────────────────────────────────────────────
 *
 * "Evidence that counts toward framework coverage / audit readiness" has
 * exactly ONE definition — `isCoverageQualifyingEvidence` /
 * `coverageQualifyingEvidenceWhere` in
 * `src/lib/compliance/coverage-evidence.ts`: APPROVED, not archived,
 * not soft-deleted, and unexpired.
 *
 * Before this PR four scorer sites disagreed. The worst offender counted
 * `status: { in: ['SUBMITTED', 'APPROVED'] }`, so a merely-SUBMITTED
 * (un-reviewed) piece of evidence silently satisfied a control's
 * coverage gate — approval was not load-bearing.
 *
 * This ratchet locks the unification. For each scorer file it asserts:
 *   1. it imports from `@/lib/compliance/coverage-evidence` (so the
 *      shared predicate is actually wired, not re-inlined);
 *   2. (comments stripped) it contains no `SUBMITTED` literal — the
 *      canary for a re-introduced inline status set that would let
 *      un-approved evidence count again;
 *   3. it contains no `status: { in: [` fragment — the shape the old
 *      inline evidence filter used.
 *
 * A future "optimisation" that re-inlines an evidence status filter
 * trips this test in the same diff.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

const SCORER_FILES = [
    'src/app-layer/usecases/audit-readiness-scoring.ts',
    'src/app-layer/usecases/framework/coverage.ts',
] as const;

/**
 * Strip block (`/* … *​/`) and line (`// …`) comments so a legitimate
 * mention of "SUBMITTED" in prose (e.g. describing the state machine)
 * doesn't false-positive. Deliberately simple — the scorer files carry
 * no comment-like string literals that would break this.
 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
}

describe('coverage-evidence predicate unification', () => {
    for (const rel of SCORER_FILES) {
        describe(rel, () => {
            const abs = path.join(REPO_ROOT, rel);
            const raw = fs.readFileSync(abs, 'utf8');
            const code = stripComments(raw);

            it('imports the shared coverage-evidence predicate', () => {
                expect(raw).toMatch(
                    /from\s+['"]@\/lib\/compliance\/coverage-evidence['"]/,
                );
            });

            it('contains no re-inlined SUBMITTED evidence status (comments stripped)', () => {
                expect(code).not.toContain('SUBMITTED');
            });

            it('contains no inline `status: { in: [` evidence filter', () => {
                expect(code).not.toMatch(/status:\s*\{\s*in:\s*\[/);
            });
        });
    }
});
