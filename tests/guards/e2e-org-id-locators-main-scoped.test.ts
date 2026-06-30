/**
 * GUARD — org-page E2E `#id` locators must be scoped to `getByRole('main')`.
 *
 * Next's streaming render can briefly leave a HIDDEN duplicate of the page
 * subtree in the DOM. A bare `page.locator('#org-…')` then intermittently
 * matches 2 elements and trips Playwright's strict-mode "resolved to N
 * elements" — the recurring `#org-risks-table` / `#org-controls-table`
 * ciso-portfolio flake (same class as the risk-matrix flake). The real node
 * lives inside `<main>`; scoping there is unambiguous.
 *
 * This ratchet keeps every `#org-*` id locator in the E2E suite scoped, so the
 * flake can't reappear via a new bare locator.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const E2E_DIR = path.resolve(__dirname, '../../tests/e2e');

function specFiles(): string[] {
    return fs
        .readdirSync(E2E_DIR)
        .filter((f) => f.endsWith('.spec.ts'))
        .map((f) => path.join(E2E_DIR, f));
}

describe('GUARD: org-page E2E #id locators are main-scoped', () => {
    it('no spec uses a bare page.locator("#org-…") (must be getByRole("main").locator)', () => {
        const offenders: string[] = [];
        for (const file of specFiles()) {
            const src = fs.readFileSync(file, 'utf8');
            src.split('\n').forEach((line, i) => {
                const trimmed = line.trim();
                // Skip comment lines (prose may mention the banned pattern).
                if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
                // The bare call form — a `getByRole('main')` (or any other
                // scoping receiver) before `.locator('#org-` is fine.
                if (/(?<![\w)])page\.locator\(\s*['"]#org-/.test(line)) {
                    offenders.push(`${path.basename(file)}:${i + 1}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});
