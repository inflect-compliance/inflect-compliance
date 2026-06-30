/**
 * Combobox dropdown width must be a FLOOR, never an exact match.
 *
 * Recurring bug (reported repeatedly): `matchTriggerWidth` pinned the
 * dropdown to the trigger's EXACT width
 * (`w-[var(--radix-popover-trigger-width)]`), so a tiny trigger like
 * "Select…" clipped its option text (e.g. "1–50 employees" rendered as a
 * wrapped, cut-off "1–50 employee").
 *
 * The fix makes `matchTriggerWidth` a MINIMUM width
 * (`min-w-[var(--radix-popover-trigger-width)]`) AND lets the size
 * container measure content width on desktop, so EVERY combobox dropdown
 * (the shared primitive behind UserCombobox / AsyncCombobox / EntityPicker
 * / every form select) grows to fit its options — capped to the viewport.
 *
 * This ratchet locks that in: the dropdown may pin a MINIMUM to the trigger
 * width, but must never re-introduce an exact `w-[trigger-width]`.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../../src/components/ui/combobox/index.tsx'),
    'utf8',
);

describe('combobox dropdown width is a floor, not an exact trigger match', () => {
    it('uses min-w (a floor) for matchTriggerWidth', () => {
        expect(SRC).toMatch(/min-w-\[var\(--radix-popover-trigger-width\)\]/);
    });

    it('never pins the dropdown to the EXACT trigger width', () => {
        // `w-[var(--radix-popover-trigger-width)]` NOT preceded by `min-`
        // is the exact-width form that clips narrow dropdowns.
        const exactWidth = /(?<!min-)\bw-\[var\(--radix-popover-trigger-width\)\]/;
        expect(SRC).not.toMatch(exactWidth);
    });

    it('measures content width on desktop so the dropdown grows to fit options', () => {
        // The AnimatedSizeContainer must size to content (not be disabled
        // when matchTriggerWidth is set) — that growth + the min-w floor is
        // what stops the truncation.
        expect(SRC).toMatch(/width=\{!isMobile\}/);
    });
});
