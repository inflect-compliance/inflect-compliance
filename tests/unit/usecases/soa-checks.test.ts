/**
 * Unit tests for src/app-layer/usecases/soa-checks.ts
 *
 * `runSoAChecks` is the pure-logic engine behind the Statement of
 * Applicability readiness report. Every Annex A requirement is run
 * through four mutually-exclusive-ish rules; the function is a
 * branch-dense classifier with no I/O. Branch coverage here protects
 * the readiness verdict an auditor relies on:
 *
 *   - Rule 1 (UNMAPPED, error)      — applicable === null
 *   - Rule 2 (MISSING_JUST, error)  — applicable === false +
 *                                     NOT_APPLICABLE control w/o
 *                                     justification (per-control)
 *   - Rule 3 (NOT_STARTED, warning) — applicable === true +
 *                                     implementationStatus NOT_STARTED
 *   - Rule 4 (NO_EVIDENCE, warning) — applicable === true +
 *                                     evidenceCount === 0
 *
 * `pass` is true iff there are zero ERROR-severity issues. Warnings
 * never fail the report.
 */
import { runSoAChecks } from '@/app-layer/usecases/soa-checks';

type SoAEntry = Parameters<typeof runSoAChecks>[0][number];

function entry(overrides: Partial<SoAEntry> = {}): SoAEntry {
    return {
        requirementCode: 'A.5.1',
        requirementTitle: 'Policies for information security',
        applicable: true,
        implementationStatus: 'IMPLEMENTED',
        evidenceCount: 1,
        mappedControls: [],
        ...overrides,
    } as SoAEntry;
}

describe('runSoAChecks', () => {
    it('returns a clean pass for an empty entry list', () => {
        const result = runSoAChecks([]);
        expect(result).toEqual({
            pass: true,
            errorCount: 0,
            warningCount: 0,
            issues: [],
        });
    });

    it('returns a clean pass for a fully-compliant applicable requirement', () => {
        const result = runSoAChecks([entry()]);
        expect(result.pass).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    // ── Rule 1: UNMAPPED ────────────────────────────────────────────

    it('flags UNMAPPED (error) when applicable is null and short-circuits other rules', () => {
        // applicable === null also has evidenceCount 0 + NOT_STARTED —
        // the `continue` must prevent rules 3 & 4 from also firing.
        const result = runSoAChecks([
            entry({
                applicable: null,
                implementationStatus: 'NOT_STARTED',
                evidenceCount: 0,
            }),
        ]);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].rule).toBe('UNMAPPED');
        expect(result.issues[0].severity).toBe('error');
        expect(result.errorCount).toBe(1);
        expect(result.warningCount).toBe(0);
        expect(result.pass).toBe(false);
    });

    // ── Rule 2: MISSING_JUSTIFICATION ───────────────────────────────

    it('flags MISSING_JUSTIFICATION for each NOT_APPLICABLE control without justification', () => {
        const result = runSoAChecks([
            entry({
                applicable: false,
                mappedControls: [
                    { applicability: 'NOT_APPLICABLE', justification: null, code: 'C-1' },
                    { applicability: 'NOT_APPLICABLE', justification: '', code: 'C-2' },
                ],
            }),
        ]);
        expect(result.issues).toHaveLength(2);
        expect(result.issues.every((i) => i.rule === 'MISSING_JUSTIFICATION')).toBe(true);
        expect(result.issues.map((i) => i.controlCode)).toEqual(['C-1', 'C-2']);
        expect(result.errorCount).toBe(2);
        expect(result.pass).toBe(false);
    });

    it('does NOT flag NOT_APPLICABLE controls that carry a justification', () => {
        const result = runSoAChecks([
            entry({
                applicable: false,
                mappedControls: [
                    {
                        applicability: 'NOT_APPLICABLE',
                        justification: 'Out of scope — no cloud assets.',
                        code: 'C-1',
                    },
                ],
            }),
        ]);
        expect(result.issues).toHaveLength(0);
        expect(result.pass).toBe(true);
    });

    it('does NOT flag APPLICABLE controls under an applicable===false requirement', () => {
        // Only NOT_APPLICABLE controls are inspected by rule 2.
        const result = runSoAChecks([
            entry({
                applicable: false,
                mappedControls: [
                    { applicability: 'APPLICABLE', justification: null, code: 'C-9' },
                ],
            }),
        ]);
        expect(result.issues).toHaveLength(0);
    });

    it('falls back to controlId when a NOT_APPLICABLE control has no code', () => {
        const result = runSoAChecks([
            entry({
                applicable: false,
                mappedControls: [
                    {
                        applicability: 'NOT_APPLICABLE',
                        justification: null,
                        controlId: 'ctl-uuid-7',
                    },
                ],
            }),
        ]);
        expect(result.issues[0].controlCode).toBe('ctl-uuid-7');
        expect(result.issues[0].reason).toContain('ctl-uuid-7');
    });

    // ── Rule 3: NOT_STARTED ─────────────────────────────────────────

    it('flags NOT_STARTED (warning) for an applicable requirement still NOT_STARTED', () => {
        const result = runSoAChecks([
            entry({
                applicable: true,
                implementationStatus: 'NOT_STARTED',
                evidenceCount: 5, // evidence present so rule 4 stays quiet
            }),
        ]);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].rule).toBe('NOT_STARTED');
        expect(result.issues[0].severity).toBe('warning');
        expect(result.warningCount).toBe(1);
        expect(result.errorCount).toBe(0);
        // warnings alone never fail the report
        expect(result.pass).toBe(true);
    });

    it('does NOT flag NOT_STARTED when implementation has progressed', () => {
        const result = runSoAChecks([
            entry({ applicable: true, implementationStatus: 'IN_PROGRESS', evidenceCount: 2 }),
        ]);
        expect(result.issues).toHaveLength(0);
    });

    // ── Rule 4: NO_EVIDENCE ─────────────────────────────────────────

    it('flags NO_EVIDENCE (warning) for an applicable requirement with zero evidence', () => {
        const result = runSoAChecks([
            entry({ applicable: true, implementationStatus: 'IMPLEMENTED', evidenceCount: 0 }),
        ]);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].rule).toBe('NO_EVIDENCE');
        expect(result.issues[0].severity).toBe('warning');
        expect(result.warningCount).toBe(1);
    });

    it('fires BOTH rule 3 and rule 4 when an applicable requirement is NOT_STARTED with no evidence', () => {
        // Rules 3 and 4 are independent `if`s — not mutually exclusive.
        const result = runSoAChecks([
            entry({ applicable: true, implementationStatus: 'NOT_STARTED', evidenceCount: 0 }),
        ]);
        expect(result.issues.map((i) => i.rule).sort()).toEqual([
            'NOT_STARTED',
            'NO_EVIDENCE',
        ].sort());
        expect(result.warningCount).toBe(2);
        expect(result.pass).toBe(true);
    });

    // ── Aggregation across multiple entries ─────────────────────────

    it('aggregates errors + warnings across a mixed entry list and fails on any error', () => {
        const result = runSoAChecks([
            entry({ applicable: null }), // error: UNMAPPED
            entry({ applicable: true, implementationStatus: 'NOT_STARTED', evidenceCount: 3 }), // warning
            entry(), // clean
        ]);
        expect(result.errorCount).toBe(1);
        expect(result.warningCount).toBe(1);
        expect(result.issues).toHaveLength(2);
        expect(result.pass).toBe(false);
    });
});
