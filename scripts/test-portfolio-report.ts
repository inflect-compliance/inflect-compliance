/**
 * Test-portfolio reporting helper.
 *
 * Prints a one-screen snapshot of the test suite's shape: how many
 * test files live in each layer (structural guard / unit /
 * integration / rendered / E2E) and the guard-to-functional ratio.
 *
 * Run via:
 *   npx tsx scripts/test-portfolio-report.ts
 *
 * This is a DIAGNOSTIC, not a CI gate. It deliberately asserts
 * nothing and exits 0 always — turning the ratio into a gate would
 * invite gaming (delete a guard to "improve" the number). The real
 * gates are the coverage floors in `jest.thresholds.json` and the
 * individual structural ratchets. See `docs/test-portfolio.md` for
 * the portfolio model this snapshot is read against.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/** One test layer: a directory plus the role it plays. */
interface Layer {
    readonly key: string;
    readonly dir: string;
    /** 'structural' = code-shape scan; 'functional' = behavioural. */
    readonly kind: 'structural' | 'functional';
    readonly role: string;
}

const LAYERS: readonly Layer[] = [
    { key: 'guards', dir: 'tests/guards', kind: 'structural', role: 'code-shape ratchets' },
    { key: 'guardrails', dir: 'tests/guardrails', kind: 'structural', role: 'architectural ratchets' },
    { key: 'unit', dir: 'tests/unit', kind: 'functional', role: 'decision logic' },
    { key: 'integration', dir: 'tests/integration', kind: 'functional', role: 'database contract' },
    { key: 'rendered', dir: 'tests/rendered', kind: 'functional', role: 'component output' },
    { key: 'e2e', dir: 'tests/e2e', kind: 'functional', role: 'user journeys' },
];

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js)$/;

/** Recursively count test files under a directory. */
function countTestFiles(dir: string): number {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            count += countTestFiles(full);
        } else if (TEST_FILE.test(entry.name)) {
            count += 1;
        }
    }
    return count;
}

function pad(s: string, width: number): string {
    return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function main(): void {
    const rows = LAYERS.map((l) => ({ ...l, files: countTestFiles(l.dir) }));

    const structural = rows
        .filter((r) => r.kind === 'structural')
        .reduce((s, r) => s + r.files, 0);
    const functional = rows
        .filter((r) => r.kind === 'functional')
        .reduce((s, r) => s + r.files, 0);
    const total = structural + functional;

    const lines: string[] = [];
    lines.push('');
    lines.push('Test portfolio snapshot');
    lines.push('═══════════════════════');
    lines.push('');
    lines.push(
        `  ${pad('Layer', 14)}${pad('Kind', 12)}${pad('Files', 8)}Role`,
    );
    lines.push(`  ${'-'.repeat(60)}`);
    for (const r of rows) {
        lines.push(
            `  ${pad(r.key, 14)}${pad(r.kind, 12)}${pad(String(r.files), 8)}${r.role}`,
        );
    }
    lines.push(`  ${'-'.repeat(60)}`);
    lines.push('');
    lines.push(`  Structural (guard + guardrail) : ${structural}`);
    lines.push(`  Functional (unit + integ + rendered + e2e) : ${functional}`);
    lines.push(`  Total test files : ${total}`);

    if (functional > 0) {
        const ratio = (structural / functional).toFixed(2);
        lines.push('');
        lines.push(`  Guard-to-functional ratio : ${ratio} structural per functional file`);
        lines.push('');
        lines.push(
            '  Note: file count is a weak signal — many guard files are tiny',
        );
        lines.push(
            '  single-assertion ratchets. The real question is whether each',
        );
        lines.push(
            '  behaviour-heavy module has a BEHAVIOURAL test, not just a scan.',
        );
        lines.push('  See docs/test-portfolio.md.');
    }
    lines.push('');

    console.log(lines.join('\n'));
}

main();
