/**
 * R17-PR11 — "All clear" celebration affordance.
 *
 * The NextBestActionCard's `readiness-check` action.id fires only
 * when ALL the urgency tiers above it have resolved (overdue
 * evidence cleared, overdue tasks cleared, no high-severity
 * risks, coverage ≥ 80%). Shipping a small green check next to
 * the heading at that moment is the dashboard's "you did it"
 * feedback — Stripe-style positive reinforcement without being
 * saccharine.
 *
 * Three load-bearing invariants:
 *
 *   1. The check icon renders ONLY for `action.id ===
 *      "readiness-check"`. Other action.ids (urgent / attention
 *      / informational) intentionally skip the check — it would
 *      conflict with their urgency-tinted glow (PR-10) by
 *      sending a "celebrate" signal in a "fix this" moment.
 *
 *   2. The icon uses the Nucleo `BadgeCheck`, coloured via
 *      `text-content-success`. Roadmap-2 PR-8 made Nucleo the
 *      canonical icon family; the no-lucide ratchet forbids new
 *      `lucide-react` imports. Token discipline: no hex literals
 *      — the "good green" comes from the same token every other
 *      success surface uses.
 *
 *   3. The rendered DOM exposes
 *      `data-next-best-action-clear-check` so the celebration
 *      surface is locatable. Future enhancements (a tooltip
 *      "you've cleared all action items!", animation polish)
 *      target this attribute.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/NextBestActionCard.tsx'),
    'utf8',
);

describe('R17-PR11 — "all clear" celebration affordance', () => {
    it('renders the check ONLY when action.id === "readiness-check"', () => {
        expect(SRC).toMatch(
            /\{action\.id\s*===\s*['"]readiness-check['"]\s*&&\s*\(\s*<BadgeCheck/,
        );
    });

    it('uses the Nucleo BadgeCheck with text-content-success token', () => {
        // Nucleo is the canonical icon family (Roadmap-2 PR-8).
        // No new lucide-react imports allowed by the no-lucide
        // ratchet.
        expect(SRC).toMatch(/<BadgeCheck[\s\S]*?text-content-success/);
        expect(SRC).toMatch(
            /import\s*\{\s*BadgeCheck\s*\}\s*from\s*["']\.\/icons\/nucleo\/badge-check["']/,
        );
        // Cross-check: confirm we did NOT regress and re-import
        // CheckCircle2 from lucide.
        expect(SRC).not.toMatch(/from\s*['"]lucide-react['"]/);
    });

    it('exposes `data-next-best-action-clear-check` data attribute', () => {
        expect(SRC).toMatch(/data-next-best-action-clear-check/);
    });
});
