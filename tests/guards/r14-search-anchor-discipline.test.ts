/**
 * Roadmap-14 PR-6 — `<SearchAnchor>` discipline.
 *
 * The centre-slot pill that opens the global command palette.
 * Replaces the R2 search-anchor that PR-11 retired (the original
 * was a dead-end placeholder; this one is wired to a real palette).
 *
 * The keyboard story is owned by `<CommandPaletteProvider>` (already
 * registers `mod+k` at priority 100). The pill is the discoverable
 * pointer affordance for users who don't know the shortcut, plus a
 * visual hint for users who do.
 *
 * Six invariants:
 *
 *   1. Click handler calls `useCommandPalette().open` — not a
 *      custom open path that would diverge from the keyboard one.
 *
 *   2. Two trigger forms are mounted (full pill + icon-only),
 *      collapsed responsively via `hidden lg:inline-flex` /
 *      `inline-flex lg:hidden`. Both carry the same a11y attrs.
 *      Mounting both is intentional — CSS responsive switching
 *      is cheaper than match.media JS swap and avoids hydration
 *      mismatches.
 *
 *   3. Each trigger carries `aria-keyshortcuts="Meta+K Control+K"`
 *      so screen readers announce the keyboard equivalent. The
 *      attribute is the standard ARIA way to declare keyboard
 *      affordances for non-form widgets.
 *
 *   4. The kbd hint uses `⌘` for Mac and `Ctrl` for non-Mac.
 *      Platform detection runs client-side; SSR default is Mac
 *      (industry-survey premium-product mode).
 *
 *   5. The label uses a single horizontal ellipsis `…` (not `...`)
 *      following CLAUDE.md's search-placeholder vocabulary.
 *
 *   6. `<TopChrome>` mounts `<SearchAnchor>` in the centre slot.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const ANCHOR_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/search-anchor.tsx'),
    'utf8',
);
const TOP_CHROME_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/TopChrome.tsx'),
    'utf8',
);

describe('Roadmap-14 PR-6 — SearchAnchor discipline', () => {
    describe('component', () => {
        it('exports `SearchAnchor` as a named export', () => {
            expect(ANCHOR_SRC).toMatch(
                /export\s+function\s+SearchAnchor\b/,
            );
        });

        it('opens the command palette via `useCommandPalette().open`', () => {
            // The click handler routes through the same API the
            // keyboard shortcut uses. A divergent open path would
            // mean pointer-driven opens skip whatever lifecycle the
            // palette provider sets up.
            expect(ANCHOR_SRC).toMatch(
                /import\s+\{\s*useCommandPalette\s*\}\s+from\s+['"]@\/components\/command-palette\/command-palette-provider['"]/,
            );
            expect(ANCHOR_SRC).toMatch(
                /const\s+\{\s*open\s*\}\s*=\s*useCommandPalette\(\)/,
            );
            expect(ANCHOR_SRC).toMatch(/onClick=\{open\}/);
        });
    });

    describe('responsive collapse — two trigger forms', () => {
        it('renders the full pill with `hidden lg:inline-flex`', () => {
            // The pill is the lg+ form. Hidden below lg so the
            // icon-only form takes over.
            expect(ANCHOR_SRC).toMatch(
                /hidden\s+lg:inline-flex/,
            );
        });

        it('renders the icon-only button with `inline-flex lg:hidden`', () => {
            // The icon button is the below-lg form. Hidden at lg+
            // so the full pill takes over.
            expect(ANCHOR_SRC).toMatch(
                /inline-flex\s+lg:hidden/,
            );
        });

        it('both triggers carry `aria-label="Open command palette"`', () => {
            // Same accessible name for both forms — same affordance,
            // different visual.
            const labelMatches =
                ANCHOR_SRC.match(/aria-label="Open command palette"/g) ??
                [];
            expect(labelMatches.length).toBeGreaterThanOrEqual(2);
        });

        it('both triggers declare `aria-keyshortcuts="Meta+K Control+K"`', () => {
            // ARIA's canonical way to advertise keyboard equivalents
            // for non-form widgets. Both keys listed so a Mac user
            // and a Windows user both get the right announcement.
            const shortcutMatches =
                ANCHOR_SRC.match(
                    /aria-keyshortcuts="Meta\+K\s+Control\+K"/g,
                ) ?? [];
            expect(shortcutMatches.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('platform-aware kbd chip', () => {
        it('uses `⌘` on Mac and `Ctrl` elsewhere', () => {
            // The ternary IS the platform-detection contract. A
            // regression that hardcodes either form breaks the
            // affordance for the other platform.
            expect(ANCHOR_SRC).toMatch(
                /isMac\s*\?\s*['"]⌘['"]\s*:\s*['"]Ctrl['"]/,
            );
        });

        it('renders the kbd chip as a real `<kbd>` element', () => {
            // Semantic <kbd> for screen readers + browser default
            // styling. The chip's aria-hidden is correct because
            // the keyshortcuts attribute already announces the
            // keys; the kbd is the visual hint only.
            expect(ANCHOR_SRC).toMatch(/<kbd\b[^>]*aria-hidden="true"/);
        });
    });

    describe('label vocabulary', () => {
        it('uses single horizontal ellipsis "…" (not "..." three dots)', () => {
            // Search-placeholder vocabulary per CLAUDE.md. The
            // ratchet binds to the literal character so a future
            // PR that "fixes" `…` to `...` is caught.
            //
            // Strip comments first so the doc-comment's mention
            // of the rule doesn't trip the structural detector.
            const stripped = ANCHOR_SRC
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).toMatch(/<span>Search…<\/span>/);
            // The literal three-dot form must not appear in the
            // visible label content (executable code only).
            expect(stripped).not.toMatch(/<span>Search\.\.\.<\/span>/);
        });

        it('does NOT append a parenthetical key hint to the label', () => {
            // Per CLAUDE.md search-placeholder vocabulary: never
            // append "(Press Enter)" / "(⌘K)" parenthetical hints.
            // The kbd chip is the discrete hint; the label stays
            // clean.
            const stripped = ANCHOR_SRC
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/\(Press/);
            expect(stripped).not.toMatch(/Search\.\.\.\s*\(/);
        });
    });

    describe('TopChrome wiring', () => {
        it('imports SearchAnchor from `./search-anchor`', () => {
            // The path is lowercase-dash, distinguishing it from
            // the retired R2 `./SearchAnchor` (uppercase camel).
            expect(TOP_CHROME_SRC).toMatch(
                /import\s+\{\s*SearchAnchor\s*\}\s+from\s+['"]\.\/search-anchor['"]/,
            );
        });

        it('mounts SearchAnchor in the centre slot', () => {
            // The centre slot of NavBar IS the search affordance's
            // home. A regression that mounts it in left or right
            // breaks the slot architecture's intent.
            expect(TOP_CHROME_SRC).toMatch(
                /center=\{<SearchAnchor\s*\/>\}/,
            );
        });
    });
});
