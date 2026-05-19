/**
 * Structural ratchet — Controls list UX polish.
 *
 * Locks the visible-change deltas applied after Epic 91's
 * structural-only refactor:
 *
 *   1. Owner column renders an avatar + name + email chip (data
 *      already comes back from the repo's `owner` include).
 *   2. Status pill is a read-only `<StatusBadge id="status-pill-{id}">`.
 *      The inline-edit `<select>` dropdown was retired 2026-05-19 at
 *      the user's request; status changes route through the detail
 *      page or the bulk-set toolbar actions.
 *   3. Applicability pill is a read-only `<StatusBadge
 *      id="applicability-pill-{id}">`. Same retirement as Status;
 *      the justification modal lives on the detail page now.
 *   4. Evidence column carries a `<Paperclip>` icon next to the count.
 *   5. The DataTable's `batchActions` are wired with the bulk-status
 *      operations (Mark Implemented / Needs Review / Not Applicable).
 *
 * This is a string-scan ratchet — same shape as
 * `controls-client-shell-adoption.test.ts`. It runs in the node
 * project so it doesn't need a jsdom mount.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONTROLS_CLIENT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
);
const source = readFileSync(CONTROLS_CLIENT, 'utf8');

describe('Controls list — UX polish', () => {
    describe('Owner column', () => {
        it('renders a chip with name + email + initial avatar', () => {
            // Avatar circle uses the first character of the display
            // string; locking this so a future "tidy-up" can't drop
            // the avatar back to a plain text cell.
            expect(source).toContain("data-testid={`control-owner-${c.id}`}");
            expect(source).toMatch(/charAt\(0\)\.toUpperCase\(\)/);
            // Name + email both render when available; em-dash for
            // unowned controls.
            expect(source).toMatch(/c\.owner\.name\s*\?\?\s*c\.owner\.email/);
            expect(source).toContain('text-content-subtle');
        });
    });

    describe('Status read-only badge (dropdown retired 2026-05-19)', () => {
        it('renders as a <StatusBadge id="status-pill-{id}">', () => {
            // The inline-edit `<select>` was retired 2026-05-19 at
            // the user's request. The cell is now a read-only badge
            // for every viewer; status changes route through the
            // per-control detail page or the bulk-set toolbar
            // actions. E2E selector `#status-pill-{id}` preserved
            // on the badge for parity with existing tests.
            expect(source).toMatch(
                /<StatusBadge\s+id=\{`status-pill-\$\{c\.id\}`\}/,
            );
            // The cell must NOT carry an inline-edit `<select>` or
            // any of the legacy `setJustification` / handler hooks.
            expect(source).not.toMatch(
                /<select\s+id=\{`status-pill-\$\{c\.id\}`\}/,
            );
            // ALL_STATUSES + the dropdown <option> map are gone too.
            expect(source).not.toContain('ALL_STATUSES');
        });

        it('no permission branch — read-only for every viewer', () => {
            // Pre-2026-05-19 the cell had two branches (editable
            // `<select>` for editors, read-only badge for readers).
            // The new shape is single-branch; the permission gate
            // is gone for this cell. A future PR that re-adds an
            // `if (!appPermissions.controls.edit)` inside the
            // Status accessor would regress the simplification.
            const statusCell = source.match(
                /accessorKey: 'status',[\s\S]+?\}\,\s+\{/,
            );
            expect(statusCell).not.toBeNull();
            expect(statusCell![0]).not.toMatch(
                /appPermissions\.controls\.edit/,
            );
        });
    });

    describe('Applicability read-only badge (dropdown retired 2026-05-19)', () => {
        it('renders as a <StatusBadge id="applicability-pill-{id}">', () => {
            expect(source).toMatch(
                /<StatusBadge\s+id=\{`applicability-pill-\$\{c\.id\}`\}/,
            );
            expect(source).not.toMatch(
                /<select\s+id=\{`applicability-pill-\$\{c\.id\}`\}/,
            );
        });

        it('justification modal infrastructure removed from the list page', () => {
            // The Not-Applicable justification flow now lives on the
            // per-control detail page only. The list page no longer
            // mounts the modal, the applicability mutation, or any
            // of the supporting state.
            expect(source).not.toContain('setJustificationModal');
            expect(source).not.toContain('applicabilityMutation');
            expect(source).not.toMatch(/<Modal\b/);
        });
    });

    describe('Evidence count column', () => {
        it('renders a Paperclip icon next to the count', () => {
            expect(source).toMatch(
                /import\s*\{[^}]*\bPaperclip\b[^}]*\}\s*from\s*['"]lucide-react['"]/,
            );
            expect(source).toMatch(/<Paperclip\s/);
            expect(source).toContain("data-testid={`control-evidence-${row.original.id}`}");
        });
    });

    describe('Bulk actions', () => {
        it('wires three batch actions (Mark Implemented / Needs Review / Not Applicable)', () => {
            // Permission-gated array; READER sees no toolbar at all.
            expect(source).toContain(
                'batchActions: appPermissions.controls.edit',
            );
            expect(source).toContain("label: 'Mark Implemented'");
            expect(source).toContain("label: 'Mark Needs Review'");
            expect(source).toContain("label: 'Mark Not Applicable'");
        });

        it('the destructive Mark-Not-Applicable action carries variant=danger', () => {
            // Same shape Epic 52's BatchAction contract uses; locks
            // in that the visual treatment doesn't drift.
            expect(source).toMatch(
                /label: 'Mark Not Applicable'[\s\S]{0,400}variant: 'danger'/,
            );
        });
    });
});
