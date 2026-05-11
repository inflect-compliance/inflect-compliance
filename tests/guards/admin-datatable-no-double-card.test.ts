/**
 * R13-PR5 — admin DataTables must not double-wrap in `cardVariants`.
 *
 * The `<DataTable>` primitive already renders its own
 * `bg-bg-default rounded-lg border-border-subtle` outer card (see
 * src/components/ui/table/table.tsx ≈ line 615). Wrapping it in an
 * additional `cardVariants({ density: 'none' })` container layers a
 * second card on top — the visible "old pattern" the user flagged
 * in R13: backdrop-blur glass-card outer + DataTable's own rounded
 * border inner. The two cards visually overlap and read as a
 * chunkier, older-looking shell than the Controls list.
 *
 * Rule: in admin + reports pages, every `<DataTable>` mounts
 * WITHOUT being wrapped in `cardVariants(`. Form-style cards that
 * are not tables (e.g. `#create-key-form`, `#invite-form`) are
 * unaffected — the ratchet scans only blocks containing a
 * `<DataTable` start tag.
 *
 * Other surfaces (form cards, dashboard cards) can still use
 * `cardVariants` freely.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SCAN_GLOBS = [
    'src/app/t/[tenantSlug]/(app)/admin',
    'src/app/t/[tenantSlug]/(app)/reports',
];

function walk(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(full);
    }
    return out;
}

/**
 * Returns the source string with all JS/TS block comments and
 * single-line comments stripped — the ratchet asserts source
 * structure, not commentary about the prior pattern.
 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('admin + reports DataTable shell (R13-PR5)', () => {
    it('no admin/reports <DataTable> is wrapped in `cardVariants(`', () => {
        const offenders: Array<{ file: string; line: number; text: string }> = [];

        for (const glob of SCAN_GLOBS) {
            const dir = path.join(ROOT, glob);
            for (const file of walk(dir)) {
                const raw = fs.readFileSync(file, 'utf8');
                const src = stripComments(raw);
                if (!/<DataTable\s/.test(src)) continue;

                // Find every `<DataTable` start tag. For each, scan
                // backwards (up to 10 lines / 800 chars) for a
                // `cardVariants(` invocation. If we land on one
                // before finding a closing `</…>` for a non-card
                // parent, that's a double-card wrap.
                const lines = src.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (!/<DataTable\s/.test(lines[i]!)) continue;

                    // Look backwards: find the nearest open
                    // `<div ... className={... cardVariants(...) ...}>`.
                    // Stop at any line that closes a block (a bare
                    // `</…>` at line start) — that means we've
                    // walked past the DataTable's immediate parent.
                    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                        const line = lines[j]!;
                        if (/cardVariants\(/.test(line) && /<div\b/.test(line)) {
                            offenders.push({
                                file: path.relative(ROOT, file),
                                line: j + 1,
                                text: line.trim().slice(0, 200),
                            });
                            break;
                        }
                        // Closing-tag heuristic — if we hit a line
                        // that just closes a JSX element, stop the
                        // back-scan (we've left the DataTable's
                        // direct ancestor chain).
                        if (/^\s*<\/\w+>\s*$/.test(line)) break;
                    }
                }
            }
        }

        if (offenders.length > 0) {
            const sample = offenders
                .slice(0, 10)
                .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
                .join('\n');
            throw new Error(
                `Found ${offenders.length} admin/reports <DataTable> wrapped in cardVariants — the primitive renders its own bordered card; an outer card double-stacks it. Drop the wrapper (keep the id on a plain <div> if one is needed for E2E).\n\nOffender(s):\n${sample}`,
            );
        }
        expect(offenders).toHaveLength(0);
    });

    it('still finds admin/reports DataTables (sanity — guard is not vacuous)', () => {
        let datatableCount = 0;
        for (const glob of SCAN_GLOBS) {
            const dir = path.join(ROOT, glob);
            for (const file of walk(dir)) {
                const src = fs.readFileSync(file, 'utf8');
                datatableCount += (src.match(/<DataTable\s/g) ?? []).length;
            }
        }
        // 8+ admin DataTables expected (notifications, integrations,
        // api-keys × 2, members × 2, roles, billing event log, rbac
        // members, reports landing).
        expect(datatableCount).toBeGreaterThanOrEqual(8);
    });
});
