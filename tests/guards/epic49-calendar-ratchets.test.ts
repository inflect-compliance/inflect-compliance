/**
 * Epic 49 — structural ratchets for the compliance-calendar feature.
 *
 * Locks the wiring contract that's easy to silently break in a
 * "simplify" PR:
 *
 *   1. The Calendar nav item is registered in the sidebar.
 *   2. The Calendar nav item carries a live badge (useCalendarBadge).
 *   3. The command palette has a `nav:calendar` entry.
 *   4. The /calendar page exists and the route handler exists.
 *   5. The shells expose the calendar event contract via
 *      `CalendarEvent` from the schema module.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../..');

function read(p: string): string {
    return fs.readFileSync(path.join(REPO, p), 'utf-8');
}

function exists(p: string): boolean {
    return fs.existsSync(path.join(REPO, p));
}

describe('Epic 49 — calendar feature wiring', () => {
    it('the Calendar route + page exist', () => {
        expect(
            exists('src/app/t/[tenantSlug]/(app)/calendar/page.tsx'),
        ).toBe(true);
        expect(
            exists('src/app/t/[tenantSlug]/(app)/calendar/CalendarClient.tsx'),
        ).toBe(true);
        expect(
            exists('src/app/api/t/[tenantSlug]/calendar/route.ts'),
        ).toBe(true);
        expect(
            exists(
                'src/app/api/t/[tenantSlug]/calendar/upcoming-count/route.ts',
            ),
        ).toBe(true);
    });

    it('the unified event DTO + Zod query schema exist', () => {
        expect(
            exists('src/app-layer/schemas/calendar.schemas.ts'),
        ).toBe(true);
        const src = read('src/app-layer/schemas/calendar.schemas.ts');
        expect(src).toMatch(/export interface CalendarEvent/);
        expect(src).toMatch(/CALENDAR_EVENT_TYPES\s*=/);
        expect(src).toMatch(/CALENDAR_EVENT_CATEGORIES\s*=/);
        expect(src).toMatch(/CalendarQuerySchema\s*=/);
    });

    it('the aggregation usecase covers every required source', () => {
        const src = read('src/app-layer/usecases/compliance-calendar.ts');
        // Each loader name guards against a future refactor that
        // accidentally drops a source — the calendar would still
        // render but a whole entity class would be invisible.
        for (const fn of [
            'loadEvidenceEvents',
            'loadPolicyEvents',
            'loadVendorEvents',
            'loadVendorDocumentEvents',
            'loadAuditCycleEvents',
            'loadControlEvents',
            'loadTestPlanEvents',
            'loadTaskEvents',
            'loadRiskEvents',
            'loadFindingEvents',
        ]) {
            expect(src).toMatch(new RegExp(`function\\s+${fn}\\b`));
        }
    });

    it('the sidebar Calendar nav item is registered with a live badge', () => {
        const src = read('src/components/layout/SidebarNav.tsx');
        expect(src).toMatch(/useCalendarBadge/);
        // Roadmap-2 PR-14 — sidebar label renamed from a hardcoded
        // 'Calendar' literal to the i18n-keyed `t('calendar')`. The
        // English translation reads "Review" now (the page surfaces
        // upcoming reviews / renewals, not a generic calendar). The
        // structural anchor stays the route + the badge wiring.
        expect(src).toMatch(/label:\s*t\(['"]calendar['"]\)/);
        expect(src).toMatch(/tenantHref\(['"]\/calendar['"]\)/);
    });

    it('the command palette has a nav:calendar entry', () => {
        const src = read(
            'src/components/command-palette/use-palette-commands.ts',
        );
        expect(src).toMatch(/id:\s*['"]nav:calendar['"]/);
        expect(src).toMatch(/href\(['"]\/calendar['"]\)/);
    });

    it('the calendar-deadlines monitor exists and exports both helpers', () => {
        expect(exists('src/app-layer/jobs/calendar-deadlines.ts')).toBe(true);
        const src = read('src/app-layer/jobs/calendar-deadlines.ts');
        expect(src).toMatch(/export\s+async\s+function\s+runCalendarDeadlineMonitor/);
        expect(src).toMatch(/export\s+async\s+function\s+runCalendarDeadlineJob/);
        // It must scan the three NEW sources the base deadline monitor
        // doesn't cover. If a future PR drops one of these, deadline
        // notifications for that source disappear silently.
        expect(src).toMatch(/scanAuditCycles/);
        expect(src).toMatch(/scanVendorDocuments/);
        expect(src).toMatch(/scanFindings/);
    });

    it('the orchestrator wires the calendar monitor into DEADLINE_DIGEST', () => {
        const src = read('src/app-layer/jobs/notification-dispatch.ts');
        expect(src).toMatch(/calendar-deadlines/);
        expect(src).toMatch(/runCalendarDeadlineMonitor/);
    });

    it('the upcoming-count helper is bounded by MAX_BADGE_COUNT (cap = 99)', () => {
        const src = read('src/app-layer/usecases/compliance-calendar.ts');
        // Cap value lives next to the function — locking it stops a
        // contributor from removing the cap and shipping a 5-digit
        // badge.
        expect(src).toMatch(/MAX_BADGE_COUNT\s*=\s*99/);
    });
});
