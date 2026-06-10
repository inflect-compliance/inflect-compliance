/**
 * UI roadmap 13 — controls Browse right-rail expand toggle.
 *
 * The "Expand all / Collapse all" TEXT button is now a single left-aligned
 * chevron toggle: ChevronDown when every section is expanded, ChevronLeft when
 * collapsed. The hint rides a canonical <Tooltip>; the E2E test-id is preserved.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../../src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx'),
    'utf8',
);

describe('UI-13 — browse expand toggle is a chevron, not a text button', () => {
    it('renders ChevronDown when expanded and ChevronLeft when collapsed', () => {
        expect(SRC).toMatch(/allExpanded \? <ChevronDown \/> : <ChevronLeft \/>/);
        expect(SRC).toMatch(/ChevronDown,\s*ChevronLeft/);
    });
    it('is left-aligned (justify-start), not the old right-aligned text button', () => {
        // The toggle block is left-aligned now (was justify-end).
        expect(SRC).toContain('flex justify-start');
        expect(SRC).toContain('controls-browse-expand-all');
        // The visible button label is no longer the literal text — it's an icon
        // with the hint on aria-label / Tooltip.
        expect(SRC).not.toMatch(/>\s*\{allExpanded \? 'Collapse all' : 'Expand all'\}\s*</);
    });
    it('keeps the canonical Tooltip hint + preserved test-id + aria-label', () => {
        expect(SRC).toMatch(/<Tooltip\s+content=\{allExpanded \? 'Collapse all' : 'Expand all'\}/);
        expect(SRC).toMatch(/data-testid="controls-browse-expand-all"/);
        expect(SRC).toMatch(/aria-label=\{allExpanded \? 'Collapse all' : 'Expand all'\}/);
    });
});
