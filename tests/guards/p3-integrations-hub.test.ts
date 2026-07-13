/**
 * P3 — Integrations & identity consolidation hub (structural ratchet).
 *
 * Locks the wiring introduced by the integrations-hub PR so a later refactor
 * can't silently unravel the consolidation story:
 *   1. The Integrations hub has a sidebar nav entry (it had none).
 *   2. The connector catalog is grouped by provider category.
 *   3. `PROVIDER_CATEGORY` + a `category` projection back the grouping.
 *   4. The admin index renders labelled sections, not one flat pill list.
 *   5. The identity surfaces (SSO / SCIM / Entra) + the connector hub share
 *      the `IdentityCrossLinks` wayfinding strip — reachable both ways.
 *   6. Every new i18n key exists in BOTH locales.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const APP = 'src/app/t/[tenantSlug]/(app)';
const SIDEBAR = 'src/components/layout/SidebarNav.tsx';
const ADMIN_INDEX = `${APP}/admin/page.tsx`;
const INTEGRATIONS_PAGE = `${APP}/admin/integrations/page.tsx`;
const USECASE = 'src/app-layer/usecases/integrations.ts';
const CROSS_LINKS = 'src/components/admin/IdentityCrossLinks.tsx';

describe('P3 — integrations hub sidebar entry', () => {
    it('SidebarNav links to the /admin/integrations hub with the Plug icon', () => {
        const src = read(SIDEBAR);
        expect(src).toMatch(/Plug/);
        expect(src).toMatch(/tenantHref\('\/admin\/integrations'\)/);
    });
});

describe('P3 — connectors grouped by category', () => {
    const src = read(INTEGRATIONS_PAGE);

    it('defines a category order and renders category eyebrows', () => {
        expect(src).toMatch(/CATEGORY_ORDER\s*=\s*\[/);
        expect(src).toMatch(/integrations\.category\./);
    });

    it('backs the grouping with a PROVIDER_CATEGORY map + category projection', () => {
        const usecase = read(USECASE);
        expect(usecase).toMatch(/PROVIDER_CATEGORY/);
        expect(usecase).toMatch(/category:/);
    });
});

describe('P3 — admin index grouped into labelled sections', () => {
    const src = read(ADMIN_INDEX);

    it('renders a data-driven sections list, not one flat pill row', () => {
        expect(src).toMatch(/sections\.map\(/);
        expect(src).toMatch(/t\('section\./);
        expect(src).toContain('Eyebrow');
    });

    it('preserves every admin pill id under the grouped layout', () => {
        for (const id of [
            'members-pill-btn',
            'rbac-pill-btn',
            'custom-roles-pill-btn',
            'api-keys-pill-btn',
            'billing-pill-btn',
            'sso-pill-btn',
            'scim-pill-btn',
            'entra-pill-btn',
            'personnel-pill-btn',
            'devices-pill-btn',
            'training-pill-btn',
            'integrations-pill-btn',
            'security-pill-btn',
            'trust-center-pill-btn',
            'risk-matrix-pill-btn',
            'risk-appetite-pill-btn',
            'notifications-pill-btn',
            'audit-log-pill-btn',
            'mcp-pill-btn',
        ]) {
            expect(src).toContain(id);
        }
    });
});

describe('P3 — identity cross-link wayfinding', () => {
    it('the IdentityCrossLinks strip exists and links all four surfaces', () => {
        const src = read(CROSS_LINKS);
        for (const href of ['/admin/sso', '/admin/scim', '/admin/entra', '/admin/integrations']) {
            expect(src).toContain(href);
        }
    });

    it('every identity surface AND the hub mount the strip', () => {
        for (const page of [
            `${APP}/admin/sso/page.tsx`,
            `${APP}/admin/scim/page.tsx`,
            `${APP}/admin/entra/page.tsx`,
            INTEGRATIONS_PAGE,
        ]) {
            expect(read(page)).toMatch(/<IdentityCrossLinks current=/);
        }
    });
});

describe('P3 — i18n parity for the new keys', () => {
    const en = JSON.parse(read('messages/en.json'));
    const bg = JSON.parse(read('messages/bg.json'));

    it('admin.section.* exists in both locales', () => {
        for (const k of ['identity', 'integrations', 'people', 'organization', 'security', 'risk']) {
            expect(en.admin.section[k]).toBeTruthy();
            expect(bg.admin.section[k]).toBeTruthy();
        }
    });

    it('admin.identityNav.* exists in both locales', () => {
        for (const k of ['label', 'sso', 'scim', 'entra', 'integrations']) {
            expect(en.admin.identityNav[k]).toBeTruthy();
            expect(bg.admin.identityNav[k]).toBeTruthy();
        }
    });

    it('admin.integrations.category.* + nav.integrations exist in both locales', () => {
        for (const k of ['identity', 'cloud', 'scm', 'hris', 'document', 'other']) {
            expect(en.admin.integrations.category[k]).toBeTruthy();
            expect(bg.admin.integrations.category[k]).toBeTruthy();
        }
        expect(en.nav.integrations).toBeTruthy();
        expect(bg.nav.integrations).toBeTruthy();
    });
});
