/**
 * B7 (2026-06-07) — a "Tasks" column on the Asset + Risk list tables,
 * mirroring Controls (done/total linked-task count).
 *
 * Backend: `WorkItemRepository.countLinkedToEntities` is a generic batched
 * TaskLink counter (one indexed query, no FK path) used by `listAssets` +
 * `listRisks` to attach `taskTotal`/`taskDone` per row. Frontend: both list
 * clients render the Tasks column + a gear toggle.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const REPO = read('src/app-layer/repositories/WorkItemRepository.ts');
const ASSET_UC = read('src/app-layer/usecases/asset.ts');
const RISK_UC = read('src/app-layer/usecases/risk.ts');
const ASSETS = read('src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx');
const RISKS = read('src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx');

describe('B7 — Tasks column on Asset + Risk', () => {
    it('WorkItemRepository exposes the generic countLinkedToEntities', () => {
        expect(REPO).toMatch(/static async countLinkedToEntities/);
        expect(REPO).toMatch(/entityType: TaskLinkEntityType/);
        // TaskLink-only — bounded by the entityIds set, not an N+1.
        expect(REPO).toMatch(/db\.taskLink\.findMany/);
    });

    it('listAssets + listRisks attach taskTotal/taskDone', () => {
        for (const uc of [ASSET_UC, RISK_UC]) {
            expect(uc).toMatch(/countLinkedToEntities/);
            expect(uc).toMatch(/taskTotal:/);
            expect(uc).toMatch(/taskDone:/);
        }
    });

    it('Asset + Risk list tables render a Tasks column (done/total) + gear toggle', () => {
        const en = JSON.parse(read('messages/en.json')) as Record<string, unknown>;
        // The "Tasks" label is either an inline literal OR — on an i18n-migrated
        // client — a t()/tx() key resolving to "Tasks" in that page's namespace.
        const resolvesToTasks = (src: string, ns: string, prefix: RegExp): boolean => {
            const key = src.match(prefix)?.[1];
            if (!key) return false;
            const val = key
                .split('.')
                .reduce<unknown>(
                    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
                    en[ns],
                );
            return val === 'Tasks';
        };
        for (const [ns, src] of [['assets', ASSETS], ['risks', RISKS]] as const) {
            expect(src).toMatch(/id: 'tasks'/);
            // header: 'Tasks' OR header: tx('colHeaders.tasks')
            expect(
                /header: 'Tasks'/.test(src) ||
                    resolvesToTasks(
                        src,
                        ns,
                        /id: 'tasks',\s*header:\s*t\w*\(['"]([\w.]+)['"]\)/,
                    ),
            ).toBe(true);
            // colVis: { id: 'tasks', label: 'Tasks' } OR label: tx('colVis.tasks')
            expect(
                /\{ id: 'tasks', label: 'Tasks' \}/.test(src) ||
                    resolvesToTasks(src, ns, /id: 'tasks', label: t\w*\(['"]([\w.]+)['"]\)/),
            ).toBe(true);
            expect(src).toMatch(/taskDone/);
        }
    });
});
