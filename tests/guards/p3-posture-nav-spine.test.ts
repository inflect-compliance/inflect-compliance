/**
 * R2-P3 — posture navigation spine + dead-surface cleanup (structural ratchet).
 *
 * The posture spine (per-framework coverage/readiness, all ~15 frameworks) was
 * unnavigable and several surfaces were dead/misleading. This locks the fixes:
 *   1. Frameworks + Coverage are in the sidebar (were ⌘K-only / URL-only).
 *   2. The controls dashboard is ungated from controls.create (read-only view).
 *   3. The dead BestValueControls leaderboard is mounted.
 *   4. SoA core mutations surface errors; the map picker is searchable +
 *      pre-filtered to unmapped controls.
 *   5. The frameworks page distinguishes a coverage error from a genuine 0%.
 *   6. SoA is scoped to ISO-family frameworks (non-ISO shows a redirect notice).
 *   7. The state-losing Clauses checkboxes are gone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const APP = 'src/app/t/[tenantSlug]/(app)';
const SIDEBAR = 'src/components/layout/SidebarNav.tsx';
const CONTROLS_CLIENT = `${APP}/controls/ControlsClient.tsx`;
const DASHBOARD = `${APP}/controls/dashboard/page.tsx`;
const SOA_CLIENT = `${APP}/reports/soa/SoAClient.tsx`;
const FRAMEWORKS_PAGE = `${APP}/frameworks/page.tsx`;
const CLAUSES = `${APP}/clauses/ClausesBrowser.tsx`;
const SOA_USECASE = 'src/app-layer/usecases/soa.ts';

describe('R2-P3 (1) posture spine in the sidebar', () => {
    const src = read(SIDEBAR);
    it('Frameworks and Coverage are navigable from the sidebar', () => {
        expect(src).toMatch(/tenantHref\('\/frameworks'\)/);
        expect(src).toMatch(/tenantHref\('\/coverage'\)/);
        expect(src).toMatch(/t\('compliance'\)/);
    });
});

describe('R2-P3 (2) controls dashboard ungated', () => {
    it('the dashboard link is not wrapped in the controls.create gate', () => {
        const src = read(CONTROLS_CLIENT);
        const dashIdx = src.indexOf('controls-dashboard-btn');
        expect(dashIdx).toBeGreaterThan(-1);
        // The nearest create-gate before the dashboard link must be far away
        // (the gate now wraps only the install action, which comes AFTER).
        const gateIdx = src.lastIndexOf('appPermissions.controls.create && (', dashIdx);
        // No create gate opens in the ~200 chars immediately preceding the
        // dashboard link — i.e. it is not gated.
        expect(gateIdx === -1 || dashIdx - gateIdx > 200).toBe(true);
    });
});

describe('R2-P3 (3) best-value leaderboard mounted', () => {
    it('the controls dashboard mounts BestValueControls', () => {
        const src = read(DASHBOARD);
        expect(src).toMatch(/import \{ BestValueControls \}/);
        expect(src).toMatch(/<BestValueControls/);
    });
});

describe('R2-P3 (4) SoA errors surfaced + searchable picker', () => {
    const src = read(SOA_CLIENT);
    it('map + justification handlers catch failures and toast', () => {
        expect(src).toMatch(/toast\.error\(t\('soaView\.mapFailed'\)\)/);
        expect(src).toMatch(/toast\.error\(t\('soaView\.justificationFailed'\)\)/);
    });
    it('the control picker is searchable and pre-filtered to unmapped', () => {
        expect(src).toMatch(/mapSearch/);
        expect(src).toMatch(/alreadyMapped/);
        expect(src).toMatch(/soa-map-search/);
    });
});

describe('R2-P3 (5) coverage error vs genuine 0%', () => {
    it('the frameworks page tracks coverageErrors', () => {
        expect(read(FRAMEWORKS_PAGE)).toMatch(/coverageErrors/);
    });
});

describe('R2-P3 (6) SoA scoped to ISO-family', () => {
    it('soa.ts computes isIsoFamily and the client renders the non-ISO notice', () => {
        expect(read(SOA_USECASE)).toMatch(/isIsoFamily/);
        expect(read(SOA_CLIENT)).toMatch(/isIsoFamily/);
        expect(read(SOA_CLIENT)).toMatch(/soaView\.nonIsoNotice/);
    });
});

describe('R2-P3 (7) Clauses checklist is not a state-losing checkbox', () => {
    it('the clause checklist no longer renders bare input checkboxes', () => {
        const src = read(CLAUSES);
        expect(src).not.toMatch(/<input type="checkbox"/);
    });
});

describe('R2-P3 i18n parity', () => {
    const en = JSON.parse(read('messages/en.json'));
    const bg = JSON.parse(read('messages/bg.json'));
    it('new nav + soa keys exist in both locales', () => {
        for (const l of [en, bg]) {
            expect(l.nav.compliance).toBeTruthy();
            expect(l.nav.frameworks).toBeTruthy();
            expect(l.nav.coverage).toBeTruthy();
            expect(l.reports.soaView.mapFailed).toBeTruthy();
            expect(l.reports.soaView.nonIsoNotice).toBeTruthy();
        }
    });
});
