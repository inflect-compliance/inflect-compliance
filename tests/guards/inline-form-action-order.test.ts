/**
 * Roadmap-5 PR-7 — inline-form action-cluster ordering.
 *
 * Five inline form footers shipped with reversed action order:
 * the destructive escape (Cancel) AFTER the commit (Submit). The
 * canonical Western reading is back-then-forward — Cancel left,
 * primary right.
 *
 *   audits/AuditsClient
 *   audits/cycles/page
 *   assets/AssetsClient
 *   findings/FindingsClient
 *   (`Modal.Footer` was already correct via the primitive)
 *
 * All five reversed in this PR.
 *
 * What this ratchet locks
 *
 *   In any inline form footer (a JSX block containing both a
 *   `<Button type="submit">` and a `<Button … onClick={() =>
 *   setShowForm(false)}>` Cancel button), the Cancel button MUST
 *   appear BEFORE the submit button in source order. Modal-based
 *   forms go through `Modal.Footer` which already enforces the
 *   order via the primitive's render.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

interface Offence {
    file: string;
    line: number;
    snippet: string;
}

describe('Inline form action-cluster ordering (Roadmap-5 PR-7)', () => {
    it('cancel buttons appear before submit buttons in inline forms', () => {
        const offenders: Offence[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    if (e.name === 'node_modules' || e.name === '.next')
                        continue;
                    walk(full);
                    continue;
                }
                if (!/\.tsx$/.test(e.name)) continue;
                const rel = path.relative(ROOT, full);
                const raw = fs.readFileSync(full, 'utf-8');
                // Pattern: <Button type="submit" ... > ... </Button> followed,
                // within ~250 chars, by <Button ... onClick=...setShowForm(false)>.
                // Whitespace-tolerant; works on single-line and multi-line
                // forms. The match indicates Submit precedes Cancel — the
                // reversed (incorrect) order.
                const VIOLATION =
                    /<Button[^>]*type="submit"[^>]*>[\s\S]{0,80}<\/Button>\s*<Button[^>]*onClick=\{[^}]*setShowForm\(false\)/;
                if (VIOLATION.test(raw)) {
                    // Find the line number of the first match.
                    const lines = raw.split('\n');
                    let buf = '';
                    let lineIdx = 0;
                    for (let i = 0; i < lines.length; i++) {
                        buf += lines[i] + '\n';
                        if (VIOLATION.test(buf)) {
                            lineIdx = i + 1;
                            break;
                        }
                    }
                    offenders.push({
                        file: rel,
                        line: lineIdx,
                        snippet: lines[lineIdx - 1]?.trim().slice(0, 200) ?? '',
                    });
                }
            }
        };
        walk(path.join(ROOT, 'src'));
        if (offenders.length > 0) {
            const lines = offenders
                .map((o) => `  ${o.file}:${o.line}\n    ${o.snippet}`)
                .join('\n');
            throw new Error(
                `Reversed action-cluster order detected. Cancel always sits LEFT of the primary submit button — back-then-forward, the Western reading direction:\n${lines}`,
            );
        }
        expect(offenders).toEqual([]);
    });
});
