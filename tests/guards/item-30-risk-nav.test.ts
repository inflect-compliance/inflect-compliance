/**
 * Item 30 — risk-section navigation shape ratchet.
 *
 * Locks the navigation layout the backlog item asked for:
 *
 *   1. **Board is reachable.** The risk board page (RQ3-10) shipped
 *      without a header nav entry. RISK_VIEW_LINKS must carry it.
 *
 *   2. **Register + Matrix are ONE toggle.** The view ToggleGroup must
 *      expose exactly the register + heatmap (matrix) options — the
 *      histogram is no longer a third peer inside it.
 *
 *   3. **Histogram is its own standalone button.** The distribution view
 *      is driven by a dedicated button (aria-pressed), not a toggle
 *      segment.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CLIENT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx',
);

describe('item 30 — risk navigation shape', () => {
    const src = fs.readFileSync(CLIENT, 'utf8');

    it('the risk board is reachable from the header nav-links', () => {
        expect(src).toContain("href: '/risks/board'");
    });

    it('the view toggle no longer carries the histogram as a third segment', () => {
        // The old 3-way toggle option for histogram must be gone.
        expect(src).not.toMatch(/value: 'histogram', label: t\.histogram/);
    });

    it('the view toggle still offers register + heatmap (the one merged toggle)', () => {
        expect(src).toMatch(/value: 'register', label: t\.register/);
        expect(src).toMatch(/value: 'heatmap', label: t\.heatmap/);
    });

    it('histogram is rendered as its own standalone toggle button', () => {
        expect(src).toContain("aria-pressed={view === 'histogram'}");
    });
});
