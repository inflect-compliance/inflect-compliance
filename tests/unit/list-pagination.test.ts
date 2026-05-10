/**
 * Epic 52 gap remediation — list-pagination adapter.
 *
 * Guards the `useListPagination` contract + the new `ColumnsDropdown`
 * state-based column toggle. Same node-env constraint as the other
 * filter-module suites — no tsx runtime load, so this is split into:
 *
 *   - logic tests for pure helpers (pagination-utils already covered;
 *     we exercise the slice + reset semantics through source inspection)
 *   - contract tests for the React primitives
 *   - adoption ratchet confirming the migrated pages wire the primitives
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    getDefaultVisibility,
    mergeVisibility,
    hasCustomVisibility,
    type ColumnVisibilityConfig,
} from '../../src/components/ui/table/column-visibility-utils';
import {
    getPaginationState,
    getPageRange,
    type PaginationMeta,
} from '../../src/components/ui/table/pagination-utils';

const ROOT = path.resolve(__dirname, '../../');
function read(rel: string) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// ─── useListPagination — source contract ─────────────────────────────

describe('useListPagination — source contract', () => {
    const src = read('src/components/ui/table/use-list-pagination.ts');

    it('is a client hook exporting the documented surface', () => {
        expect(src).toMatch(/^"use client"/);
        expect(src).toMatch(/export function useListPagination/);
        expect(src).toMatch(/export interface UseListPagination\b/);
        expect(src).toMatch(/export interface UseListPaginationOptions\b/);
    });

    it('syncs the current page to the ?page= URL param', () => {
        expect(src).toMatch(/searchParams\?\.get\(["']page["']\)/);
        expect(src).toMatch(/params\.set\(["']page["']/);
        expect(src).toMatch(/params\.delete\(["']page["']\)/);
    });

    it('router.replace is scroll:false so the viewport stays put', () => {
        expect(src).toMatch(/scroll:\s*false/);
    });

    it('resets pageIndex to 0 when resetKey changes', () => {
        expect(src).toMatch(/lastResetKey/);
        expect(src).toMatch(/setPaginationState\(\(p\)\s*=>\s*\(\{[^}]*pageIndex:\s*0/);
    });

    it('listens for popstate to restore the page on browser back/forward', () => {
        expect(src).toMatch(/addEventListener\(["']popstate["']/);
    });

    it('defaults pageSize to the shared DEFAULT_PAGE_SIZE', () => {
        expect(src).toMatch(/pageSize = DEFAULT_PAGE_SIZE/);
        expect(src).toMatch(/from ["']\.\/pagination-utils["']/);
    });
});

// ─── Column visibility — reuse existing pure utils ──────────────────

describe('Column visibility defaults + merge', () => {
    const config: ColumnVisibilityConfig = {
        all: ['a', 'b', 'c'],
        defaultVisible: ['a', 'b'],
    };

    it('defaultVisibility marks defaults true, everything else false', () => {
        expect(getDefaultVisibility(config)).toEqual({ a: true, b: true, c: false });
    });

    it('mergeVisibility preserves saved state and evolves schema safely', () => {
        // User previously hid b; c was just added to the config.
        const saved = { a: true, b: false, unknown: true };
        expect(mergeVisibility(saved, config)).toEqual({
            a: true,
            b: false,
            c: false, // new column falls back to default
        });
    });

    it('fixed columns cannot be hidden even if saved state says so', () => {
        const cfg: ColumnVisibilityConfig = { all: ['a', 'b'], defaultVisible: ['a'], fixed: ['a'] };
        expect(mergeVisibility({ a: false, b: true }, cfg)).toEqual({ a: true, b: true });
    });

    it('hasCustomVisibility returns true only when user diverged from defaults', () => {
        expect(hasCustomVisibility({ a: true, b: true, c: false }, config)).toBe(false);
        expect(hasCustomVisibility({ a: true, b: false, c: false }, config)).toBe(true);
    });
});

// ─── ColumnsDropdown — source contract ───────────────────────────────

describe('ColumnsDropdown — source contract', () => {
    const src = read('src/components/ui/table/columns-dropdown.tsx');

    it('is a client component with the documented props surface', () => {
        expect(src).toMatch(/^"use client"/);
        expect(src).toMatch(/export interface ColumnsDropdownProps\b/);
        for (const prop of ['columns', 'visibility', 'onChange', 'defaultVisibility']) {
            expect(src).toContain(prop);
        }
    });

    it('uses the shared Popover + cmdk listbox (no bespoke menu)', () => {
        expect(src).toMatch(/from ["']\.\.\/popover["']/);
        expect(src).toMatch(/from ["']cmdk["']/);
        expect(src).toMatch(/<Command\b/);
    });

    it('supports alwaysVisible columns (not rendered in the toggle list)', () => {
        expect(src).toMatch(/alwaysVisible\?\:\s*boolean/);
        expect(src).toMatch(/filter\(\(c\)\s*=>\s*!c\.alwaysVisible\)/);
    });

    it('shows a "Reset to defaults" row only when the user diverged', () => {
        expect(src).toMatch(/Reset to defaults/);
        expect(src).toMatch(/someHidden/);
    });

    it('uses semantic tokens (no raw slate classes)', () => {
        // Drift sentinel — the new primitive must stay on semantic tokens
        // so the light/dark toggle works out of the box.
        expect(src).not.toMatch(/bg-slate-/);
        expect(src).not.toMatch(/text-slate-/);
    });
});

// ─── Epic 52 adoption ratchet ───────────────────────────────────────

describe('Epic 52 adoption — migrated pages wire column visibility', () => {
    // The list-page-shell work (commits c71556e / 9d7b76d / fa3105d)
    // moved Controls / Risks / Evidence from paginated rendering to
    // viewport-clamped internal scroll inside <ListPageShell.Body>
    // with <DataTable fillBody>. The pagination wiring was removed
    // because all filtered rows now render inside the table card and
    // the card scrolls; chunking them into 24-row pages was the
    // cause of the "I can't see my new row, must be on page 2"
    // confusion the user reported.
    //
    // Column-visibility persistence was retained — that's a per-user
    // setting independent of how rows are paged.
    const MIGRATED = [
        {
            dir: 'controls',
            client: 'ControlsClient.tsx',
            storageKey: 'inflect:col-vis:controls',
        },
        {
            dir: 'risks',
            client: 'RisksClient.tsx',
            storageKey: 'inflect:col-vis:risks',
        },
        {
            dir: 'evidence',
            client: 'EvidenceClient.tsx',
            storageKey: 'inflect:col-vis:evidence',
        },
    ];

    it.each(MIGRATED)('%s wraps the table in ListPageShell with fillBody (no pagination)', (page) => {
        const src = read(`src/app/t/[tenantSlug]/(app)/${page.dir}/${page.client}`);
        expect(src).toContain('ListPageShell');
        expect(src).toMatch(/\bfillBody\b/);
        // Pagination wiring should be GONE — internal scroll is the
        // contract. If a future PR re-adds pagination here, the
        // user's "no additional pages" requirement is regressing.
        expect(src).not.toMatch(/useListPagination/);
        expect(src).not.toMatch(/pagination=\{pg\.pagination\}/);
        expect(src).not.toMatch(/onPaginationChange=\{pg\.setPagination\}/);
    });

    it.each(MIGRATED)('%s wires column visibility with a namespaced storage key', (page) => {
        const src = read(`src/app/t/[tenantSlug]/(app)/${page.dir}/${page.client}`);
        // R10-PR6 unified the gear behind `useColumnsDropdown`; the
        // older `useColumnVisibility` is still a valid lower-level
        // hook. Accept either name — the storage-key contract is
        // what we lock.
        expect(src).toMatch(/useColumns?(Visibility|Dropdown)/);
        expect(src).toContain(`'${page.storageKey}'`);
    });

    it.each(MIGRATED)('%s renders the columns gear inside the FilterToolbar actions slot', (page) => {
        const src = read(`src/app/t/[tenantSlug]/(app)/${page.dir}/${page.client}`);
        // After R10-PR6 the gear can be sourced two ways:
        //   - Legacy: literal `<ColumnsDropdown>` JSX
        //   - Canonical: `useColumnsDropdown(...)` → `dropdown` node
        // Either is acceptable; the slot wiring is what we lock.
        expect(src).toMatch(/(ColumnsDropdown|columnsDropdown)/);
        // Two equivalent shapes:
        //   (a) Direct FilterToolbar usage: `<FilterToolbar actions={...}>`
        //   (b) EntityListPage shell: `filters={{ ..., toolbarActions: ... }}`
        //       — EntityListPage forwards `toolbarActions` into
        //       FilterToolbar's `actions` prop internally.
        expect(src).toMatch(/(actions=\{|toolbarActions:)/);
    });
});

// ─── Sanity: pagination-utils remain intact ──────────────────────────

describe('pagination-utils — unchanged contract', () => {
    it('getPageRange returns the documented shape', () => {
        const meta: PaginationMeta = { page: 2, pageSize: 25, totalCount: 60 };
        expect(getPageRange(meta)).toEqual({ from: 26, to: 50, total: 60 });
    });

    it('getPaginationState handles the last partial page', () => {
        const meta: PaginationMeta = { page: 3, pageSize: 25, totalCount: 60 };
        const state = getPaginationState(meta);
        expect(state.pageCount).toBe(3);
        expect(state.canNextPage).toBe(false);
        expect(state.canPreviousPage).toBe(true);
        expect(state.range.to).toBe(60);
    });

    it('empty list collapses to isEmpty + isSinglePage', () => {
        const state = getPaginationState({ page: 1, pageSize: 25, totalCount: 0 });
        expect(state.isEmpty).toBe(true);
        expect(state.isSinglePage).toBe(true);
    });
});
