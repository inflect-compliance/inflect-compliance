/**
 * RQ3-OB-F — Unified first-run empty state ratchet.
 *
 * Every analytical view on a tenant with zero risks used to render
 * a different shape (plain `<p>`, in-band primitive, nothing at
 * all). This ratchet locks the post-unification contract:
 *
 *   - the canonical primitive lives at
 *     `src/components/risks/RiskFirstRunEmpty.tsx`;
 *   - it routes through `<EmptyState>` so the design-system shape
 *     stays consistent;
 *   - the three known surfaces (risks list, dashboard, board)
 *     import the primitive AND don't carry the legacy plain-<p>
 *     shapes the migration deleted.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const primitive = read('src/components/risks/RiskFirstRunEmpty.tsx');
const risksClient = read('src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx');
const dashboard = read('src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx');
const board = read('src/app/t/[tenantSlug]/(app)/risks/board/page.tsx');

const IMPORT = "from '@/components/risks/RiskFirstRunEmpty'";

describe('RQ3-OB-F — the canonical primitive holds its contract', () => {
    test('routes through the EmptyState design-system primitive', () => {
        expect(primitive).toMatch(/import \{ EmptyState \} from '@\/components\/ui\/empty-state'/);
        expect(primitive).toMatch(/<EmptyState/);
        expect(primitive).toMatch(/variant="no-records"/);
    });

    test('the CTA target is the tenant-scoped /risks?create=1 deep-link', () => {
        // useTenantHref keeps the URL tenant-scoped; the destination
        // page (RisksClient) auto-opens the modal off this query.
        expect(primitive).toMatch(/useTenantHref/);
        expect(primitive).toMatch(/tenantHref\('\/risks\?create=1'\)/);
    });

    test('a localised title + description anchor the message across surfaces', () => {
        // i18n-aware: title + description are localised via next-intl.
        // Assert the t('key') wiring in source AND that the en.json values
        // still carry the canonical message the contract anchors on.
        expect(primitive).toMatch(/title=\{t\('title'\)\}/);
        expect(primitive).toMatch(/description=\{t\('description'\)\}/);
        const en = JSON.parse(read('messages/en.json'));
        expect(en.panels.riskFirstRun.title).toBe('No risks on the register yet');
        expect(en.panels.riskFirstRun.description).toMatch(/dashboard, board, and analytics views populate from here/);
    });

    test('onCreateClick override swaps href for onClick (in-page modal escape hatch)', () => {
        expect(primitive).toMatch(/onCreateClick\?: \(\) => void/);
        // The override branch produces an onClick instead of href.
        expect(primitive).toMatch(/onCreateClick[\s\S]{0,250}onClick: onCreateClick/);
    });
});

describe('RQ3-OB-F — every known first-run surface uses the primitive', () => {
    test('RisksClient mounts the primitive when the list is empty', () => {
        expect(risksClient).toMatch(new RegExp(IMPORT));
        expect(risksClient).toMatch(/<RiskFirstRunEmpty/);
    });

    test('Dashboard StatusBreakdown emptyState slot uses the primitive', () => {
        expect(dashboard).toMatch(new RegExp(IMPORT));
        expect(dashboard).toMatch(/emptyState=\{<RiskFirstRunEmpty size="sm" \/>\}/);
        // The legacy plain-<p> shape that used to live in the slot is gone.
        expect(dashboard).not.toMatch(
            /emptyState=\{\s*<p [^>]*>\s*\{t\('noRisksYet'\)\}\s*<\/p>/,
        );
    });

    test('Board hygiene-empty branch uses the primitive', () => {
        expect(board).toMatch(new RegExp(IMPORT));
        expect(board).toMatch(/<RiskFirstRunEmpty size="sm" \/>/);
        // Legacy "No risks on the register yet" plain <p> is gone.
        expect(board).not.toMatch(
            /className="text-sm text-content-subtle"[\s\S]{0,60}data-testid="board-hygiene-empty"/,
        );
    });
});
