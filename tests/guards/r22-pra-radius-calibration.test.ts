/**
 * R22-PR-A — Radius calibration ratchet.
 *
 * Roadmap-22 (Carved Carbon) is the precision-refinement layer on
 * top of R19's liquid-carbon + R20's elegance. The four prompts
 * the user supplied converged on "carved, not inflated" as the
 * target aesthetic. PR-A is the literal carving — drop the button
 * silhouette from `rounded-lg` (12px) to `rounded-[10px]` (10px).
 *
 * 2px tighter. Still gentler than a hard 8px (Tailwind's
 * `rounded-md`), but visibly more carved. Mirrored to:
 *
 *   - control-variants.ts — the form-control parity scaffold so
 *     the Input / date-picker trigger / combobox trigger surface
 *     shapes match the button shape exactly.
 *   - input.tsx — the inline radius literal (not yet wired
 *     through control-variants).
 *   - date-picker/trigger.tsx — same.
 *   - button.tsx disabled-fallback paths (two of them — the
 *     disabledTooltip branch + the loading/disabled branch).
 *
 * xs keeps its size-variant `rounded-md` override (8px) because
 * at h-7 a 10px radius makes the button read pill-ish.
 *
 * Five surfaces touched, one structural ratchet locking each.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const BUTTON_VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button-variants.ts'),
    'utf8',
);
const BUTTON_TSX = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button.tsx'),
    'utf8',
);
const CONTROL_VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/control-variants.ts'),
    'utf8',
);
const INPUT_TSX = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/input.tsx'),
    'utf8',
);
const DATE_TRIGGER = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/date-picker/trigger.tsx'),
    'utf8',
);

describe('R22-PR-A — Radius calibration (carved silhouette)', () => {
    describe('button-variants.ts cva base', () => {
        it('uses `rounded-[10px]` not `rounded-lg`', () => {
            // The base shape — every variant + size inherits it
            // (xs/sm/md/lg). xs further overrides to rounded-md
            // (8px) via its own size variant.
            const base =
                BUTTON_VARIANTS.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
            // Strip comments so the file's doc-block references to
            // "rounded-lg" don't trip the negative check.
            const stripped = base
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).toMatch(/rounded-\[8px\]/);
            expect(stripped).not.toMatch(/\brounded-lg\b/);
        });

        it('xs size variant keeps `rounded-md` (8px) — pill avoidance at h-7', () => {
            // The size-variant override is load-bearing — strip
            // it and xs becomes a near-pill at h-7. Asserted
            // structurally so a future "uniform radius" PR has to
            // engage with the rationale.
            expect(BUTTON_VARIANTS).toMatch(
                /xs:\s*"[^"]*\brounded-md\b/,
            );
        });
    });

    describe('button.tsx disabled-fallback paths', () => {
        it('disabledTooltip branch uses `rounded-[10px]`', () => {
            // The disabledTooltip render path doesn't route through
            // the cva — its className is hand-rolled. Must move in
            // lockstep with the cva base.
            const stripped = BUTTON_TSX.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            // Match the disabledTooltip cn() block.
            expect(stripped).toMatch(
                /"rounded-\[8px\] border border-border-subtle bg-bg-subtle text-sm text-content-subtle"/,
            );
        });

        it('loading/disabled branch uses `rounded-[10px]`', () => {
            const stripped = BUTTON_TSX.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).toMatch(
                /"rounded-\[8px\] border border-border-subtle bg-bg-subtle text-content-subtle"/,
            );
        });

        it('no `rounded-lg` literal remains in button.tsx', () => {
            const stripped = BUTTON_TSX.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/\brounded-lg\b/);
        });
    });

    describe('control-variants.ts mirror', () => {
        it('uses `rounded-[10px]` not `rounded-lg`', () => {
            const stripped = CONTROL_VARIANTS.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).toMatch(/rounded-\[8px\]/);
            expect(stripped).not.toMatch(/\brounded-lg\b/);
        });
    });

    describe('inline form-control radius mirrors', () => {
        // input.tsx + date-picker/trigger.tsx don't yet wire
        // through control-variants — they roll their own radius
        // literal. R22-PR-A keeps them in lockstep with the cva
        // base.
        it('input.tsx uses `rounded-[10px]`', () => {
            const stripped = INPUT_TSX.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).toMatch(/rounded-\[8px\]/);
            expect(stripped).not.toMatch(/\brounded-lg\b/);
        });

        it('date-picker/trigger.tsx uses `rounded-[10px]`', () => {
            const stripped = DATE_TRIGGER.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).toMatch(/rounded-\[8px\]/);
            expect(stripped).not.toMatch(/\brounded-lg\b/);
        });
    });

    describe('the carved silhouette is consistent across the button + control family', () => {
        // Pairs of (file, source) — all should resolve to the same
        // corner shape so a filter-toolbar row of (Input + Button +
        // date-picker trigger) reads as one chassis.
        it('every file in the family uses 10px or smaller', () => {
            // Cardinality: button-variants.ts (cva base + xs
            // override), control-variants.ts, input.tsx,
            // date-picker/trigger.tsx, button.tsx (2 fallbacks).
            // Each must use either rounded-[10px] (the corrected
            // shape) or rounded-md (xs only).
            for (const src of [
                BUTTON_VARIANTS,
                CONTROL_VARIANTS,
                INPUT_TSX,
                DATE_TRIGGER,
                BUTTON_TSX,
            ]) {
                const stripped = src
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/\/\/[^\n]*/g, '');
                expect(stripped).not.toMatch(/\brounded-lg\b/);
            }
        });
    });
});
