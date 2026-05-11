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
        // The legacy primary group used to render without an
        // eyebrow at all. After PR-3 the GROUPED nav must carry
        // eyebrow titles so it reads as grouped, not flat.
        //
        // R13-PR7 — the first section is now a SOLO Board home
        // link (no eyebrow by design — mirrors the home-anchor
        // pattern in Linear / Stripe / Vercel sidebars). The
        // load-bearing assertion is that the WORKSPACE group
        // (the first grouped section) still carries a title.
        // Any future restructure that drops every section title
        // and reverts to a flat list still fails this ratchet.
        const src = read('src/components/layout/SidebarNav.tsx');
        const fnMatch = src.match(
            /export function useNavSections[\s\S]+?return\s*\[([\s\S]+?)\];/,
        );
        expect(fnMatch).not.toBeNull();
        const sections = fnMatch![1]!;
        // Every grouped section MUST carry a `title:`. Workspace is
        // the canonical primary group — assert it explicitly.
        expect(sections).toMatch(/title:\s*['"]Workspace['"]/);
        // And at least 3 titled sections in total (Workspace +
        // Comply + Manage, after R13-PR7).
        const titleCount = (sections.match(/\btitle:\s*['"]/g) ?? []).length;
        expect(titleCount).toBeGreaterThanOrEqual(3);
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
