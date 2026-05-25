/**
 * Structural ratchet — the gear button must NOT be wrapped in
 * `<Tooltip>` inside the Popover Trigger.
 *
 * Background: `<Popover><Tooltip><Button/></Tooltip></Popover>` looks
 * harmless but is functionally broken. Radix's
 * `Popover.Trigger asChild` clones its IMMEDIATE child (the Tooltip)
 * adding onClick / aria-expanded / aria-haspopup / data-state. The
 * Tooltip is a function component with a fixed prop surface — the
 * cloned props land on Tooltip and are silently dropped. The gear
 * renders visually but has no click handler; users see a button
 * that doesn't open.
 *
 * The fix: render the Button directly inside Popover. Use `title`
 * for the native hover hint and `aria-label` for the screen-reader
 * name. The companion rendered test in
 * `tests/rendered/edit-columns-button-click.test.tsx` locks the
 * runtime behaviour; this guard locks the structural shape.
 *
 * Two files maintain the gear:
 *   • columns-dropdown.tsx  — state-controlled variant
 *   • edit-columns-button.tsx — TanStack table-bound variant
 *
 * Both must follow the rule.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const FILES = [
    'src/components/ui/table/columns-dropdown.tsx',
    'src/components/ui/table/edit-columns-button.tsx',
];

describe('Edit columns button — no <Tooltip> wrapping inside Popover', () => {
    for (const rel of FILES) {
        describe(rel, () => {
            const src = read(rel);

            it('does NOT import the Tooltip primitive', () => {
                // The gear file imports neither `Tooltip` nor reaches
                // for `../tooltip`. This is the strongest possible
                // structural guarantee that the regression class
                // (wrapping the gear in `<Tooltip>` again) can't be
                // re-introduced — re-adding the import is the FIRST
                // step a future "let's add a tooltip back" PR would
                // take, and that step fails CI here.
                expect(src).not.toMatch(
                    /import\s*\{[^}]*\bTooltip\b[^}]*\}\s*from\s*['"]\.\.\/tooltip['"]/,
                );
            });

            it('provides hover affordance via `title=` instead of <Tooltip>', () => {
                // Same rationale — the previous Tooltip wrapping
                // gave the user a popup hint on hover. `title`
                // attribute on the button preserves the hover hint
                // natively without the prop-swallowing trap.
                expect(src).toMatch(/title=["{]/);
            });

            it('preserves screen-reader accessibility via aria-label', () => {
                expect(src).toMatch(/aria-label=["{]/);
            });
        });
    }
});
