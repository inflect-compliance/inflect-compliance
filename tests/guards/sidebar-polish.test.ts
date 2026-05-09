/**
 * Roadmap-2 PR-3 — sidebar polish discipline.
 *
 * After PR-3 the sidebar reads top-to-bottom as: identity (logo),
 * grouped nav (each group with an eyebrow label), inline command
 * opener, user block. Three quiet horizontal divisions, each with
 * a different role. This ratchet locks the structural pieces of
 * that polish in:
 *
 *   1. The tenant sidebar's primary nav group has a `title` —
 *      previously the first group rendered without an eyebrow,
 *      reading as an unstructured list.
 *   2. The org sidebar's primary nav group has a `title` for the
 *      same reason — visual hierarchy parity across the two
 *      shells.
 *   3. The sidebar mounts an inline command-palette opener
 *      (`data-testid="sidebar-search-anchor"`). On desktop this
 *      is a secondary anchor next to the chrome's primary
 *      `<SearchAnchor>`; on mobile it is THE anchor (the chrome
 *      is hidden below the md breakpoint).
 *
 * What this ratchet does NOT police
 *   The exact eyebrow strings ("Workspace", "Portfolio", "Manage")
 *   are copy-tunable. The ratchet asserts the SLOT exists, not
 *   the words inside it.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('Sidebar polish discipline (Roadmap-2 PR-3)', () => {
    it('tenant sidebar primary nav group carries an eyebrow title', () => {
        // The first NavSection used to be `{ items: [...] }` with
        // no `title` — the eyebrow was implicit (none rendered).
        // After PR-3 it MUST carry a `title` so the nav reads as
        // grouped, not as a flat list.
        const src = read('src/components/layout/SidebarNav.tsx');
        // Slice from `useNavSections()` body to the closing `]` —
        // first section is the one we care about.
        const fnMatch = src.match(
            /export function useNavSections[\s\S]+?return\s*\[([\s\S]+?)\];/,
        );
        expect(fnMatch).not.toBeNull();
        const sections = fnMatch![1]!;
        // First object literal in the array MUST contain a
        // `title:` key. We approximate by checking the first 800
        // characters of the section body — covers the first
        // section's full literal in practice without requiring a
        // full TS parser.
        const head = sections.slice(0, 800);
        expect(head).toMatch(/title:\s*['"][A-Z]/);
    });

    it('org sidebar primary nav group carries an eyebrow title', () => {
        const src = read('src/components/layout/OrgSidebarNav.tsx');
        const fnMatch = src.match(
            /export function useOrgNavSections[\s\S]+?const\s+sections[\s\S]+?=\s*\[([\s\S]+?)\];/,
        );
        expect(fnMatch).not.toBeNull();
        const sections = fnMatch![1]!;
        const head = sections.slice(0, 800);
        expect(head).toMatch(/title:\s*['"][A-Z]/);
    });

    it('SidebarContent renders the inline command-palette opener', () => {
        const src = read('src/components/layout/SidebarNav.tsx');
        // The opener carries a stable test-id so Playwright
        // selectors stay stable.
        expect(src).toMatch(/data-testid=["']sidebar-search-anchor["']/);
        // And it actually wires through the existing palette API,
        // not a parallel one.
        expect(src).toMatch(
            /from\s+['"]@\/components\/command-palette\/command-palette-provider['"]/,
        );
        expect(src).toMatch(/useCommandPalette/);
    });
});
