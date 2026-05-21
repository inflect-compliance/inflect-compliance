/**
 * #102 item 1 — control-detail tab-lazy ratchet.
 *
 * Before this refactor, `ControlRepository.getById` eager-loaded
 * `controlTasks` / `evidenceLinks` / `evidence` / `frameworkMappings`
 * into every control-detail page-data payload — bytes the Overview
 * tab never reads. The split:
 *
 *   - page-data calls `getControlHeader` (header scalars + user refs
 *     + `contributors` + relation `_count`s), NOT the full getter;
 *   - the Tasks / Evidence / Mappings tab bodies each fetch their
 *     own slice on demand via a `useTenantSWR` key gated on the
 *     active tab.
 *
 * This ratchet fails if a regression re-points page-data at the
 * full getter, or the page goes back to reading the heavy arrays
 * off the control payload.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE_DATA = read('src/app-layer/usecases/control/page-data.ts');
const QUERIES = read('src/app-layer/usecases/control/queries.ts');
const REPO = read('src/app-layer/repositories/ControlRepository.ts');
const PAGE = read(
    'src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx',
);

describe('control detail — tab-lazy page-data (#102 item 1)', () => {
    it('page-data uses the header-only getter, not the full getControl', () => {
        expect(PAGE_DATA).toMatch(/getControlHeader\(ctx, controlId\)/);
        expect(PAGE_DATA).not.toMatch(/\bgetControl\(/);
    });

    it('getControlHeader is exported and getHeaderById exists', () => {
        expect(QUERIES).toMatch(/export async function getControlHeader\b/);
        expect(REPO).toMatch(/static async getHeaderById\b/);
    });

    it('the header getter counts the tabbed relations, not loads them', () => {
        // `getHeaderById` carries a `_count` for the four tabbed
        // relations; it must NOT array-include them (that's the very
        // over-fetch this refactor removed).
        const m = REPO.match(/static async getHeaderById[\s\S]*?\n {4}}/);
        expect(m).not.toBeNull();
        const body = m![0];
        expect(body).toMatch(/_count:\s*{/);
        expect(body).not.toMatch(/controlTasks:\s*{\s*orderBy/);
        expect(body).not.toMatch(/evidenceLinks:\s*{\s*orderBy/);
        expect(body).not.toMatch(/frameworkMappings:\s*{\s*include/);
    });

    it('the page fetches the Tasks and Evidence tabs lazily', () => {
        // Each per-tab SWR key is `null` until its tab is active.
        expect(PAGE).toMatch(
            /tab === 'tasks'[\s\S]{0,90}CACHE_KEYS\.controls\.tasks/,
        );
        expect(PAGE).toMatch(
            /tab === 'evidence'[\s\S]{0,90}CACHE_KEYS\.controls\.evidence/,
        );
    });

    it('the Mappings tab is extracted into _tabs/ and self-fetches', () => {
        // The whole Mappings tab — fetch + map/unmap + JSX — moved
        // off the page into its own component, which mounts only
        // when the tab is active.
        expect(PAGE).toMatch(/<ControlMappingsTab\b/);
        const TAB = read(
            'src/app/t/[tenantSlug]/(app)/controls/[controlId]/_tabs/ControlMappingsTab.tsx',
        );
        expect(TAB).toMatch(/useTenantSWR<[^>]*>\(\s*CACHE_KEYS\.controls\.mappings/);
    });

    it('the page no longer reads the heavy arrays off the control payload', () => {
        expect(PAGE).not.toMatch(/control\.controlTasks/);
        expect(PAGE).not.toMatch(/control\.evidenceLinks/);
        expect(PAGE).not.toMatch(/control\.frameworkMappings/);
    });
});
