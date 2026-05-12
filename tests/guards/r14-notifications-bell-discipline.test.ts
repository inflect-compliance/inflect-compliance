/**
 * Roadmap-14 PR-8 — `<NotificationsBell>` discipline.
 *
 * Right-slot affordance between the workspace switcher and the
 * user menu. Bell icon + unread-count badge + popover listing
 * recent notifications.
 *
 * Six load-bearing invariants:
 *
 *   1. Fetches from `/api/notifications` — the existing app-layer
 *      surface (no new API). Lazy on popover open + one initial
 *      ping on mount for the badge count.
 *
 *   2. Unread badge renders ONLY when `unreadCount > 0`. The bell
 *      stays uncluttered when nothing demands attention.
 *
 *   3. Badge is bg-error-emphasis (the canonical "demands
 *      attention" tone). A regression to brand-default would
 *      conflict with R10's StatusBadge brand-ban for tones that
 *      compete with chrome.
 *
 *   4. Each row is either a `<Link>` (when linkUrl is set) or a
 *      `<button>` (no link). Click marks-as-read optimistically
 *      + navigates if applicable.
 *
 *   5. Empty state uses the R11 personality vocabulary — "All
 *      clear" with a calm icon — NOT a generic "No notifications".
 *
 *   6. Mark-all-read action sits in the popover header, gated on
 *      `unreadCount > 0` (no need to show the action when nothing
 *      is unread).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const BELL_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/notifications-bell.tsx'),
    'utf8',
);
const TOP_CHROME_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/TopChrome.tsx'),
    'utf8',
);

describe('Roadmap-14 PR-8 — NotificationsBell discipline', () => {
    describe('component', () => {
        it('exports `NotificationsBell` as a named export', () => {
            expect(BELL_SRC).toMatch(
                /export\s+function\s+NotificationsBell\b/,
            );
        });

        it('fetches from the canonical `/api/notifications` endpoint', () => {
            // Same source the existing notification dashboard
            // uses. PR-8 doesn't add a new API.
            expect(BELL_SRC).toMatch(
                /fetch\(\s*['"]\/api\/notifications['"]/,
            );
        });

        it('reuses the cached list across re-opens (no fetch storm)', () => {
            // The lazy-fetch effect must guard on `items !== null`
            // so re-opening the popover doesn't re-fetch every
            // time. A regression would put the user's network on
            // a hot path during routine bell clicks.
            expect(BELL_SRC).toMatch(
                /if\s*\(\s*items\s*!==\s*null\s*\)\s*return/,
            );
        });
    });

    describe('bell trigger', () => {
        it('is a `<button type="button">` with full ARIA popover attrs', () => {
            expect(BELL_SRC).toMatch(
                /<button[\s\S]+?type="button"/,
            );
            expect(BELL_SRC).toMatch(/aria-haspopup="menu"/);
            expect(BELL_SRC).toMatch(/aria-expanded=\{open\}/);
        });

        it('uses Bell icon from lucide', () => {
            expect(BELL_SRC).toMatch(
                /import\s+\{[^}]*\bBell\b[^}]*\}\s+from\s+['"]lucide-react['"]/,
            );
            expect(BELL_SRC).toMatch(/<Bell\b/);
        });

        it('carries `data-testid="top-chrome-notifications-bell"`', () => {
            expect(BELL_SRC).toMatch(
                /data-testid="top-chrome-notifications-bell"/,
            );
        });

        it('aria-label varies with unreadCount (announces the count)', () => {
            // Assistive tech needs to know whether the bell is
            // demanding attention. Static "Notifications" would
            // hide the count from screen readers.
            expect(BELL_SRC).toMatch(
                /aria-label=\{[\s\S]*?unreadCount\s*>\s*0[\s\S]*?unread notifications/,
            );
        });
    });

    describe('unread badge', () => {
        it('renders only when `unreadCount > 0`', () => {
            // The bell stays uncluttered when nothing demands
            // attention. A regression that always renders a "0"
            // chip would add visual noise to every page.
            expect(BELL_SRC).toMatch(
                /\{unreadCount\s*>\s*0\s*&&\s*\(/,
            );
        });

        it('caps display at "99+" for very large counts', () => {
            // Two-digit numbers fit the badge geometry; three-digit
            // numbers break the layout. Cap at 99+.
            expect(BELL_SRC).toMatch(
                /unreadCount\s*>\s*99\s*\?\s*['"]99\+['"]\s*:\s*unreadCount/,
            );
        });

        it('uses bg-error-emphasis tone (not brand)', () => {
            // Demands-attention tone. R10's StatusBadge ratchet
            // bans brand-tone usage on competing chrome — applies
            // here too. The error-emphasis colour is the canonical
            // "needs attention" surface across the codebase.
            expect(BELL_SRC).toMatch(/bg-bg-error-emphasis/);
        });

        it('uses tabular-nums for the count digits', () => {
            // Stable badge width as the count changes (1 → 12 → 99).
            // tabular-nums prevents the badge from jiggling.
            expect(BELL_SRC).toMatch(/tabular-nums/);
        });
    });

    describe('popover rows', () => {
        it('marks rows as read optimistically (UI updates before server confirms)', () => {
            // The setItems-with-mapping happens BEFORE the await on
            // the PATCH. If the server fails, the local optimistic
            // state remains (reconciles on next fetch).
            expect(BELL_SRC).toMatch(
                /setItems\(\(prev\)\s*=>[\s\S]*?prev\.map[\s\S]*?\{\s*\.\.\.x,\s*read:\s*true\s*\}/,
            );
        });

        it('uses Link when linkUrl is set, button otherwise', () => {
            // Two row shapes — Link for navigation (SPA-routed),
            // button for read-only notifications. A regression
            // that always uses <button> would lose middle-click +
            // SPA-route behaviour for notifications with linkUrl.
            expect(BELL_SRC).toMatch(
                /n\.linkUrl\s*\?\s*\(/,
            );
            expect(BELL_SRC).toMatch(/<Link\b/);
        });

        it('each row has deterministic `data-testid="notification-row-<id>"`', () => {
            expect(BELL_SRC).toMatch(
                /data-testid=\{?`notification-row-\$\{n\.id\}`/,
            );
        });
    });

    describe('empty state', () => {
        it('uses `<EmptyState>` (R11 personality) — not a bare string', () => {
            // R11's empty-state vocabulary applies. "All clear"
            // with the Bell icon vs "No notifications" is the
            // difference between personality and bureaucracy.
            expect(BELL_SRC).toMatch(
                /import\s+\{\s*EmptyState\s*\}\s+from\s+['"]@\/components\/ui\/empty-state['"]/,
            );
            expect(BELL_SRC).toMatch(/<EmptyState\b/);
            expect(BELL_SRC).toMatch(/title="All clear"/);
        });
    });

    describe('mark-all-read action', () => {
        it('lives in the popover header, gated on `unreadCount > 0`', () => {
            // No reason to render the action when there's nothing
            // to mark. The button only shows when at least one row
            // is unread.
            expect(BELL_SRC).toMatch(
                /\{unreadCount\s*>\s*0\s*&&\s*\([\s\S]*?Mark all read/,
            );
            expect(BELL_SRC).toMatch(
                /data-testid="notifications-mark-all-read"/,
            );
        });
    });

    describe('TopChrome wiring', () => {
        it('imports NotificationsBell from `./notifications-bell`', () => {
            expect(TOP_CHROME_SRC).toMatch(
                /import\s+\{\s*NotificationsBell\s*\}\s+from\s+['"]\.\/notifications-bell['"]/,
            );
        });

        it('mounts NotificationsBell between Identity + UserMenu', () => {
            // Slot order: workspace context (switcher) → notifications
            // bell → account (user menu). Switching this order
            // would put account before notifications, which feels
            // wrong (account scope is widest; notifications are
            // tenant-scoped; switcher is the narrowest = leftmost).
            expect(TOP_CHROME_SRC).toMatch(
                /<Identity\s*\/>\s*\n\s*<NotificationsBell\s*\/>\s*\n\s*<UserMenu\s*\/>/,
            );
        });
    });
});
