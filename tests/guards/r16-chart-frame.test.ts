/**
 * Roadmap-16 PR-3 — `<ChartFrame>` wrapper.
 *
 * Responsive container with state-driven branch rendering for
 * every R16 chart consumer. Owns the loading / empty / error
 * vocabulary so they read identically across charts.
 *
 * Five load-bearing invariants:
 *
 *   1. File exists at the canonical path. Component named
 *      `ChartFrame` exported.
 *
 *   2. Branches on `state.kind` for all four cases (`loading`,
 *      `error`, `empty`, `ready`). A consumer threading a
 *      `ChartState` should never have to write its own
 *      branch-switching code.
 *
 *   3. The ready branch wraps the render-prop in
 *      `@visx/responsive`'s `<ParentSize>` for measurement and
 *      guards the zero-size first-pass so consumers don't have to.
 *
 *   4. Loading default is `<Skeleton>`. Empty default is
 *      `<EmptyState>`. Error default is `<ErrorState>`. All
 *      three default surfaces are overridable via per-branch
 *      fallback props.
 *
 *   5. The outer chrome carries:
 *        - `data-chart-frame="true"` selector marker
 *        - `data-chart-state="loading|empty|error|ready"` per-
 *          state marker so consumers can target a state in CSS
 *          if needed
 *        - `data-testid` forwarded from `testId` prop
 *        - default `min-height: 240px` so the layout doesn't
 *          shift as state changes
 *
 *   6. Re-exported from the charts barrel.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const FRAME_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-frame.tsx'),
    'utf8',
);
const BARREL_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/index.ts'),
    'utf8',
);

describe('Roadmap-16 PR-3 — ChartFrame wrapper', () => {
    describe('exports + barrel', () => {
        it('exports ChartFrame', () => {
            expect(FRAME_SRC).toMatch(
                /export\s+function\s+ChartFrame\s*</,
            );
        });

        it('barrel re-exports ChartFrame from `./chart-frame`', () => {
            expect(BARREL_SRC).toMatch(
                /export\s*\{\s*ChartFrame\s*\}\s*from\s*['"]\.\/chart-frame['"]/,
            );
        });
    });

    describe('state-driven branch rendering', () => {
        it('branches on state.kind === "loading"', () => {
            expect(FRAME_SRC).toMatch(/state\.kind\s*===\s*['"]loading['"]/);
        });

        it('branches on state.kind === "error"', () => {
            expect(FRAME_SRC).toMatch(/state\.kind\s*===\s*['"]error['"]/);
        });

        it('branches on state.kind === "empty"', () => {
            expect(FRAME_SRC).toMatch(/state\.kind\s*===\s*['"]empty['"]/);
        });

        it('ready branch wraps the render-prop in `<ParentSize>`', () => {
            // The whole "responsive" contract is `ParentSize`.
            // Without it, consumers have to measure their own
            // container — which every pre-R16 chart did differently.
            expect(FRAME_SRC).toMatch(/<ParentSize\b/);
        });

        it('guards the zero-size first measurement pass', () => {
            // `ParentSize` returns `{ width: 0, height: 0 }` during
            // the first render. Without a guard, consumers paint
            // a 0×0 SVG that the browser collapses to display:none.
            expect(FRAME_SRC).toMatch(
                /width\s*===\s*0\s*\|\|\s*height\s*===\s*0/,
            );
        });

        it('renders the data inside the ready branch', () => {
            // The render-prop signature passes `data: T` so
            // consumers can use the narrowed `state.data` without
            // re-checking the discriminant.
            expect(FRAME_SRC).toMatch(/data:\s*state\.data/);
        });
    });

    describe('default fallbacks', () => {
        it('loading default is `<Skeleton>`', () => {
            expect(FRAME_SRC).toMatch(/loadingFallback\s*\?\?\s*\(\s*<Skeleton/);
        });

        it('empty default is `<EmptyState>`', () => {
            expect(FRAME_SRC).toMatch(
                /emptyFallback\s*\?\?\s*\(\s*<EmptyState/,
            );
        });

        it('error default is `<ErrorState>`', () => {
            expect(FRAME_SRC).toMatch(
                /errorFallback\s*\?\?\s*\(\s*<ErrorState/,
            );
        });

        it('all three fallback props are exposed for override', () => {
            expect(FRAME_SRC).toMatch(/loadingFallback\?\s*:\s*ReactNode/);
            expect(FRAME_SRC).toMatch(/emptyFallback\?\s*:\s*ReactNode/);
            expect(FRAME_SRC).toMatch(/errorFallback\?\s*:\s*ReactNode/);
        });
    });

    describe('outer chrome markers + layout', () => {
        it('marks the outer wrapper with data-chart-frame="true"', () => {
            expect(FRAME_SRC).toMatch(/data-chart-frame=['"]true['"]/);
        });

        it('marks the outer wrapper with data-chart-state={stateKind}', () => {
            // Per-state marker lets consumer-side CSS target a
            // specific state (e.g. quieter bg for the empty
            // branch). Without it, every state shares one bg.
            expect(FRAME_SRC).toMatch(/data-chart-state=\{stateKind\}/);
        });

        it('forwards data-testid from the `testId` prop', () => {
            expect(FRAME_SRC).toMatch(/data-testid=\{testId\}/);
        });

        it('declares a default min-height of 240px', () => {
            // Layout stability: without min-height, the frame
            // collapses to 0px when state is `loading` (no measured
            // child) and jumps to the chart's height when state
            // flips to `ready`. The fixed default prevents the
            // visual jolt.
            expect(FRAME_SRC).toMatch(/DEFAULT_MIN_HEIGHT\s*=\s*240/);
        });

        it('outer chrome uses rounded corners + elevated bg token', () => {
            // Visual contract — consistent on every chart in the
            // product.
            expect(FRAME_SRC).toMatch(/rounded-lg/);
            expect(FRAME_SRC).toMatch(/bg-bg-elevated/);
        });
    });
});
