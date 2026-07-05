/**
 * Epic 54 — Control quick-inspect / edit Sheet migration.
 *
 * Node-env jest source-inspects the new Sheet surface:
 *
 *   1. Sheet composition — uses shared <Sheet> primitives (no bespoke
 *      overlay), sits at size="md", provides actions with left-aligned
 *      "Open full detail" and right-aligned Cancel / Save.
 *   2. Data flow — loads via the same queryKeys.controls.detail used by
 *      the full detail page, PATCHes the identical endpoint the legacy
 *      edit modal used, fires the separate owner POST only when changed.
 *   3. UX invariants — unsaved-changes guard, focus on name, canSave gate,
 *      read-only summary (status / applicability / owner / code).
 *   4. List wiring — quick-edit icon per row opens the Sheet; row click
 *      retains the legacy navigation to the full detail page (two entries,
 *      one cognitive model).
 */

import * as fs from 'fs';
import * as path from 'path';

// next-intl is ESM (jest can't parse its export); mock it to resolve real
// en.json values so any component load/render yields the original English.
jest.mock('next-intl', () => {
    const en = require('../../messages/en.json');
    return {
        useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
            let v = key
                .split('.')
                .reduce((o: unknown, k) =>
                    o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined, en[ns]);
            if (typeof v !== 'string') return key;
            if (params) for (const [p, val] of Object.entries(params)) v = (v as string).replace(new RegExp(`\\{${p}\\}`, 'g'), String(val));
            return v;
        },
        useLocale: () => 'en',
    };
});

const ROOT = path.resolve(__dirname, '../../');
function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

const SHEET_SRC = read('src/app/t/[tenantSlug]/(app)/controls/ControlDetailSheet.tsx');
const CLIENT_SRC = read('src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx');
// Catalog for source-grep assertions on strings migrated to next-intl keys.
const EN_CONTROLS = JSON.parse(read('messages/en.json')).controls as {
    detail: { sheet: Record<string, string> };
};

// ─── 1. Sheet composition ────────────────────────────────────────

describe('ControlDetailSheet — shared Sheet composition', () => {
    it('is a client component', () => {
        expect(SHEET_SRC).toMatch(/^'use client'/);
    });

    it('uses the shared <Sheet> (no bespoke overlay)', () => {
        expect(SHEET_SRC).toMatch(/from ['"]@\/components\/ui\/sheet['"]/);
        expect(SHEET_SRC).not.toMatch(/fixed inset-0 bg-black/);
    });

    it('sits at size="md" — the documented detail-view width', () => {
        expect(SHEET_SRC).toMatch(/size=["']md["']/);
    });

    it('composes Sheet.Header + Sheet.Body + Sheet.Actions', () => {
        expect(SHEET_SRC).toMatch(/<Sheet\.Header\b/);
        expect(SHEET_SRC).toMatch(/<Sheet\.Body\b/);
        expect(SHEET_SRC).toMatch(/<Sheet\.Actions\b/);
    });

    it('Actions align="between" splits "Open full detail" from Cancel/Save', () => {
        expect(SHEET_SRC).toMatch(/align=["']between["']/);
    });

    it('provides an explicit Sheet.Close affordance for Cancel', () => {
        expect(SHEET_SRC).toMatch(/<Sheet\.Close asChild>/);
    });
});

// ─── 2. Data flow ────────────────────────────────────────────────

describe('ControlDetailSheet — data flow', () => {
    it('loads the control via useTenantSWR(CACHE_KEYS.controls.detail) — shared cache with the full detail page', () => {
        expect(SHEET_SRC).toMatch(/useTenantSWR<ControlDetailResponse>/);
        expect(SHEET_SRC).toMatch(/CACHE_KEYS\.controls\.detail\(controlId\)/);
    });

    it('skips the fetch until a controlId is selected (null-key idiom)', () => {
        expect(SHEET_SRC).toMatch(/controlId\s*\?\s*CACHE_KEYS\.controls\.detail\(controlId\)\s*:\s*null/);
    });

    it('PATCHes /controls/:id with the editable field set', () => {
        expect(SHEET_SRC).toMatch(/method:\s*['"]PATCH['"]/);
        expect(SHEET_SRC).toMatch(/apiUrl\(`\/controls\/\$\{controlId\}`\)/);
        for (const field of ['name', 'category', 'frequency']) {
            expect(SHEET_SRC).toContain(field);
        }
    });

    it('fires the owner POST only when the owner actually changed', () => {
        expect(SHEET_SRC).toMatch(/draft\.owner\.trim\(\)\s*!==\s*originalOwner/);
        expect(SHEET_SRC).toMatch(/apiUrl\(`\/controls\/\$\{controlId\}\/owner`\)/);
    });

    it('revalidates all three caches on success — own detail, the list, and the full page', () => {
        // The Sheet reads controls.detail(id); the list reads controls.list();
        // the full [controlId] page reads controls.pageData(id) — a SEPARATE
        // cache entry. An edit must invalidate all three or one goes stale.
        expect(SHEET_SRC).toMatch(/await detailQuery\.mutate\(\)/);
        expect(SHEET_SRC).toMatch(/CACHE_KEYS\.controls\.list\(\)/);
        expect(SHEET_SRC).toMatch(/swrMutate\(apiUrl\(CACHE_KEYS\.controls\.pageData\(controlId\)\)\)/);
    });

    it('closes the Sheet on save success (setControlId(null))', () => {
        expect(SHEET_SRC).toMatch(/setControlId\(null\)/);
    });

    it('surfaces mutation errors into a data-testid-reachable alert', () => {
        expect(SHEET_SRC).toMatch(/data-testid=["']control-sheet-save-error["']/);
        expect(SHEET_SRC).toMatch(/role=["']alert["']/);
    });
});

// ─── 3. UX invariants ────────────────────────────────────────────

describe('ControlDetailSheet — UX invariants', () => {
    it('focuses the name input shortly after open', () => {
        expect(SHEET_SRC).toMatch(/nameInputRef\.current\?\.focus\(\)/);
    });

    it('gates save behind canWrite + dirty + name length ≥ 3 + not saving', () => {
        expect(SHEET_SRC).toMatch(/canWrite\s*&&\s*dirty\s*&&\s*form\.name\.trim\(\)\.length\s*>=\s*3\s*&&\s*!saving/);
    });

    it('fieldset disables edits when the user lacks write permission', () => {
        expect(SHEET_SRC).toMatch(/<fieldset[\s\S]*?disabled=\{!canWrite\s*\|\|\s*saving\}/);
    });

    it('unsaved-changes guard prompts before close', () => {
        expect(SHEET_SRC).toMatch(/window\.confirm\(tx\('detail\.sheet\.discardConfirm'\)\)/);
        expect(EN_CONTROLS.detail.sheet.discardConfirm).toBe('Discard unsaved changes?');
    });

    it('renders a read-only summary card (status / applicability / owner / code)', () => {
        expect(SHEET_SRC).toMatch(/data-testid=["']control-sheet-summary["']/);
        expect(SHEET_SRC).toMatch(/tx\('detail\.sheet\.applicability'\)/);
        expect(EN_CONTROLS.detail.sheet.applicability).toBe('Applicability');
        expect(SHEET_SRC).toMatch(/tx\('detail\.fields\.owner'\)/);
    });

    it('"Open full detail" link routes to the canonical control page', () => {
        expect(SHEET_SRC).toMatch(/href=\{tenantHref\(`\/controls\/\$\{control\.id\}`\)\}/);
        expect(SHEET_SRC).toMatch(/data-testid=["']control-sheet-open-full["']/);
    });

    it('uses semantic tokens only — no raw Dub palette', () => {
        for (const pattern of [
            /\bbg-white\b/,
            /\btext-black\b/,
            /\bbg-neutral-\d/,
            /\btext-neutral-\d/,
        ]) {
            expect(SHEET_SRC).not.toMatch(pattern);
        }
    });
});

// ─── 4. ControlsClient wiring ────────────────────────────────────
//
// 2026-06-19 — the Controls LIST no longer wires this Sheet. Editing moved
// into the one-click docked side panel (ControlEditPanel / TaskEditPanel); the
// quick-edit pencil column + ControlDetailSheet mount were removed. The
// ControlDetailSheet component above is still a valid, tested surface (kept for
// potential detail-page reuse). The new panel wiring is covered by
// `controls-quickview-interaction` + `controls-client-shell-adoption`.

describe('ControlsClient — list no longer mounts the edit Sheet (moved to the side panel)', () => {
    it('does NOT mount <ControlDetailSheet> or the quick-edit column anymore', () => {
        expect(CLIENT_SRC).not.toMatch(/<ControlDetailSheet\b/);
        expect(CLIENT_SRC).not.toMatch(/id:\s*['"]quick-edit['"]/);
        expect(CLIENT_SRC).not.toMatch(/setSheetControlId/);
    });

    it('mounts the editable side panels instead', () => {
        expect(CLIENT_SRC).toMatch(/<ControlEditPanel\b/);
        expect(CLIENT_SRC).toMatch(/<TaskEditPanel\b/);
    });

    it('row-click navigation to the full detail page is preserved', () => {
        // Regression guard — the Sheet is an *additional* entry point; the
        // list row still navigates for users who want the tabbed detail.
        // Right-rail Phase 2 extracted the handler to a stable
        // `useCallback` (`handleRowClick`) so a selection-toggle
        // re-render doesn't rebuild the table model — assert both the
        // wiring (`onRowClick: handleRowClick`) and the navigation
        // logic inside the callback.
        expect(CLIENT_SRC).toMatch(/onRowClick:\s*handleRowClick/);
        expect(CLIENT_SRC).toMatch(
            /handleRowClick\s*=\s*useCallback\([\s\S]*?router\.push\(tenantHref\(`\/controls\/\$\{row\.original\.id\}`\)\)/,
        );
    });
});
