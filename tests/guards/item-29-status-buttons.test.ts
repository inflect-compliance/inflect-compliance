/**
 * Item 29 — brand-color status action on every entity detail header.
 *
 * Assets, Controls, Tasks and Risks detail pages each expose a
 * "change status" control in the top-right actions slot, brand-colored
 * (Button `variant="primary"`, the same as the "+ …" create buttons).
 * Risk / Task / Control already had the control (wrong color — fixed);
 * Asset gained both the control and the schema field that lets its
 * status actually persist.
 *
 * This ratchet locks all four so a future edit can't drop the control
 * or quietly revert the brand color.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGES: ReadonlyArray<{ entity: string; rel: string; selectId: string }> = [
    { entity: 'risk', rel: 'src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx', selectId: 'risk-status-select' },
    { entity: 'task', rel: 'src/app/t/[tenantSlug]/(app)/tasks/[taskId]/page.tsx', selectId: 'task-status-select' },
    { entity: 'control', rel: 'src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx', selectId: 'control-status-select' },
    { entity: 'asset', rel: 'src/app/t/[tenantSlug]/(app)/assets/[id]/page.tsx', selectId: 'asset-status-select' },
];

describe('item 29 — primary-color status action on detail pages', () => {
    it.each(PAGES)('$entity detail has a brand-primary status control', ({ rel, selectId }) => {
        const src = read(rel);
        // The status select exists…
        expect(src).toContain(`id="${selectId}"`);
        // …and is brand-colored via the primary Button variant in
        // buttonProps (object form distinguishes it from the JSX
        // `variant="primary"` create buttons).
        expect(src).toMatch(/buttonProps=\{\{\s*variant:\s*'primary'/);
    });

    it('the asset update schema accepts status so the asset control persists', () => {
        const schema = read('src/lib/schemas/index.ts');
        const block = schema.slice(
            schema.indexOf('UpdateAssetSchema'),
            schema.indexOf('AssetUpdateRequest'),
        );
        expect(block).toMatch(/status:\s*z\.enum\(\['ACTIVE',\s*'RETIRED'\]\)/);
    });
});
