/**
 * polish #6 — one compact-currency formatter, period.
 *
 * The dashboard's old `formatMoney` was a parallel implementation
 * that drifted on currency symbol ($) and rounding ($1.25M vs
 * €1.3M). It's gone; this ratchet stops it (or any other
 * one-off compact-currency function) from creeping back.
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/**
 * `execFileSync` (argv form) bypasses the shell so the scan-root
 * path and patterns can never be interpreted as shell tokens —
 * silences CodeQL's `js/shell-command-injection-from-environment`.
 */
function grep(args: readonly string[]): string {
    try {
        return execFileSync('grep', args, { encoding: 'utf-8' }).trim();
    } catch (e) {
        const err = e as { status: number; stdout?: string };
        if (err.status === 1) return ''; // grep exit 1 = no matches
        throw e;
    }
}

describe('polish #6 — single compact-currency formatter', () => {
    test('no parallel currency formatter is declared anywhere in src/', () => {
        // Any `function|const formatMoney|formatCurrency|formatCompactCurrency`
        // declaration outside the canonical home is the regression class.
        const out = grep([
            '-rnE',
            '(function|const)\\s+(formatMoney|formatCurrency)\\b',
            path.join(ROOT, 'src'),
            '--include=*.ts',
            '--include=*.tsx',
        ]);
        expect(out).toBe('');
    });

    test('formatCompactCurrency is declared once (the canonical home in risk-coherence.ts)', () => {
        const out = grep([
            '-rln',
            'export function formatCompactCurrency',
            path.join(ROOT, 'src'),
            '--include=*.ts',
        ]).split('\n');
        expect(out).toEqual(['src/lib/risk-coherence.ts'].map((p) => path.join(ROOT, p)));
    });
});
