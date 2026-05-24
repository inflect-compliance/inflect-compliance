/**
 * B7 — Layout redesign ratchet.
 *
 *   1. Large-monitor responsiveness: AppShell carries the
 *      `2xl:max-w-screen-2xl` + `3xl:max-w-none` cascade so wide
 *      monitors actually use the screen real estate. The `3xl`
 *      breakpoint is registered in tailwind.config.js.
 *   2. LeftAccordionRail primitive exists and meets the contract
 *      the user briefed: quiet (default no-open sections),
 *      click-only expansion (no hover auto-open), orientation-
 *      style organisation of the adjacent table.
 *   3. ListPageShell.Body accepts both `aside` (right rail) and
 *      `leftRail` slots; the rails sit OUTSIDE the table card
 *      via `gap-section` separation, not the legacy
 *      `gap-default` flush positioning.
 *   4. The canonical Controls list mounts a LeftAccordionRail
 *      with at least the Status + Category orientation sections.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('B7 — layout redesign', () => {
    describe('Large-monitor responsiveness', () => {
        const shell = read('src/components/layout/AppShell.tsx');
        const tailwind = read('tailwind.config.js');

        it('AppShell cascades max-width past 7xl on wide monitors', () => {
            expect(shell).toMatch(/max-w-7xl/);
            expect(shell).toMatch(/2xl:max-w-screen-2xl/);
            expect(shell).toMatch(/3xl:max-w-none/);
        });

        it('tailwind.config.js registers the 3xl breakpoint', () => {
            expect(tailwind).toMatch(/['"]3xl['"]:\s*['"]1792px['"]/);
        });
    });

    describe('LeftAccordionRail primitive', () => {
        const src = read('src/components/ui/left-accordion-rail.tsx');

        it('exports the primitive + section type', () => {
            expect(src).toMatch(/export function LeftAccordionRail/);
            expect(src).toMatch(/export interface LeftAccordionRailSection/);
        });

        it('defaults to zero open sections (quiet)', () => {
            // Default state: `new Set(defaultOpenIds ?? [])` — if
            // the consumer doesn't seed it, the rail mounts silent.
            expect(src).toMatch(
                /new Set\(defaultOpenIds \?\? \[\]\)/,
            );
        });

        it('expand is click-only — no hover auto-open', () => {
            // The button toggle handler is `onClick`, not
            // `onMouseEnter` / `onFocus`. The chevron transition
            // is the only motion path.
            expect(src).toMatch(/onClick=\{\(\) => toggle\(section\.id\)\}/);
            expect(src).not.toMatch(/onMouseEnter=\{[\s\S]{0,80}toggle\(/);
            expect(src).not.toMatch(/onFocus=\{[\s\S]{0,80}toggle\(/);
        });

        it('renders aria-expanded + aria-controls (a11y)', () => {
            expect(src).toMatch(/aria-expanded=\{isOpen\}/);
            expect(src).toMatch(/aria-controls=\{contentId\}/);
        });
    });

    describe('ListPageShell.Body accepts both rails + separates them', () => {
        const shell = read('src/components/layout/ListPageShell.tsx');

        it('ListPageShellBodyProps declares leftRail + aside', () => {
            expect(shell).toMatch(/leftRail\?:\s*ReactNode/);
            expect(shell).toMatch(/aside\?:\s*ReactNode/);
        });

        it('rails sit OUTSIDE the table card with `gap-section`', () => {
            // The two-rail body row uses `gap-section`, the
            // generous breathing space — pre-B7 the flush
            // `gap-default` read as "rail embedded into the
            // table area". The rail's wrapper is `flex-shrink-0
            // xl:self-start` so it tracks the body's top.
            expect(shell).toMatch(/gap-section/);
            expect(shell).toMatch(/data-testid="list-page-left-rail"/);
            expect(shell).toMatch(/data-testid="list-page-aside"/);
        });
    });

    describe('Controls list mounts the LeftAccordionRail', () => {
        const src = read(
            'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
        );

        it('imports the primitive', () => {
            expect(src).toMatch(/import \{[\s\S]{0,200}LeftAccordionRail/);
        });

        it('threads orientationRail to EntityListPage.leftRail', () => {
            expect(src).toMatch(/leftRail=\{orientationRail\}/);
            expect(src).toMatch(/<LeftAccordionRail\b/);
        });

        it('sections include at least Status + Category orientation', () => {
            // Status is enum-driven (always renders); Category
            // is data-derived (only renders when the snapshot has
            // categories) — both wiring branches must be in code.
            expect(src).toMatch(/id:\s*['"]status['"]/);
            expect(src).toMatch(/label:\s*['"]Status['"]/);
            expect(src).toMatch(/id:\s*['"]category['"]/);
            expect(src).toMatch(/label:\s*['"]Category['"]/);
        });

        it('clicking a rail value routes through filterCtx.set', () => {
            expect(src).toMatch(/filterCtx\.set\(['"]status['"]/);
            expect(src).toMatch(/filterCtx\.set\(['"]category['"]/);
        });
    });
});
