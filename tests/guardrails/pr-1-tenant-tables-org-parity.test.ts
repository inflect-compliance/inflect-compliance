/**
 * Tenant list tables — load-on-scroll (infinite scroll) ratchet.
 *
 * Supersedes the original "Load more …" button parity (the manual
 * `<TableLoadMoreFooter>` button was replaced by load-on-scroll: the
 * windowing hook still slices the rows, but the next batch now appends
 * automatically when an `IntersectionObserver` sentinel scrolls into
 * view at the bottom of the table body).
 *
 * The engine:
 *   `useThresholdLoadMore` (slice rows) → `<DataTable onReachEnd>` →
 *   `<Table>` renders `<InfiniteScrollSentinel>` INSIDE the scroll
 *   wrapper → `useInViewport(sentinel, { rootMargin })` fires
 *   `loadMore` on the visibility edge. The sentinel is gated by the
 *   consumer passing `onReachEnd={hasMore ? loadMore : undefined}` so
 *   it (and its observer) unmount at the end of the data.
 *
 * Assertions:
 *   1. `useThresholdLoadMore` primitive + barrel export (unchanged).
 *   2. `useInViewport` accepts a `rootMargin` (the pre-load lever).
 *   3. `<InfiniteScrollSentinel>` exists, observes via useInViewport,
 *      fires onReachEnd on the visibility edge.
 *   4. `onReachEnd` is threaded Table → DataTable → EntityListPage,
 *      and the `<Table>` renders the sentinel ONLY when onReachEnd is
 *      set, INSIDE the scroll wrapper.
 *   5. All seven tenant list pages consume `useThresholdLoadMore` and
 *      pass `onReachEnd={hasMore… ? loadMore… : undefined}` to their
 *      table — and NONE of them render the retired
 *      `<TableLoadMoreFooter>` button.
 *   6. The two pages whose page.tsx wrapper severed the viewport-clamp
 *      flex chain (assets, vendors) render their client directly.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const APP = 'src/app/t/[tenantSlug]/(app)';

describe('Tenant list tables — load-on-scroll', () => {
    describe('useThresholdLoadMore primitive', () => {
        const src = read('src/components/ui/hooks/use-threshold-load-more.ts');
        const barrel = read('src/components/ui/hooks/index.ts');

        it('exports useThresholdLoadMore + DEFAULT_LOAD_MORE_THRESHOLD', () => {
            expect(src).toMatch(/export function useThresholdLoadMore/);
            expect(src).toMatch(/export const DEFAULT_LOAD_MORE_THRESHOLD\s*=\s*50/);
        });

        it('returns the hasMore + loadMore vocabulary the sentinel drives', () => {
            expect(src).toMatch(/hasMore:\s*boolean/);
            expect(src).toMatch(/loadMore:\s*\(\)\s*=>\s*void/);
            expect(src).toMatch(/visibleRows:\s*TRow\[\]/);
        });

        it('is exported from the @/components/ui/hooks barrel', () => {
            expect(barrel).toMatch(/useThresholdLoadMore/);
            expect(barrel).toMatch(/DEFAULT_LOAD_MORE_THRESHOLD/);
        });

        it('narrowing input keeps remaining rows visible (no surprise collapse)', () => {
            expect(src).toMatch(/\.slice\(0,\s*windowSize\)/);
            expect(src).not.toMatch(/useEffect[\s\S]{0,400}setWindowSize\(threshold\)/);
        });
    });

    describe('useInViewport — pre-load lever', () => {
        const src = read('src/components/ui/hooks/use-in-viewport.tsx');

        it('accepts a rootMargin and forwards it to IntersectionObserver', () => {
            expect(src).toMatch(/rootMargin\??:\s*string/);
            expect(src).toMatch(/new IntersectionObserver\([\s\S]{0,200}rootMargin/);
        });
    });

    describe('InfiniteScrollSentinel primitive', () => {
        const src = read('src/components/ui/table/infinite-scroll-sentinel.tsx');
        const barrel = read('src/components/ui/table/index.ts');

        it('exports the component + props', () => {
            expect(src).toMatch(/export function InfiniteScrollSentinel/);
            expect(src).toMatch(/export interface InfiniteScrollSentinelProps/);
        });

        it('observes a ref via useInViewport with a rootMargin', () => {
            expect(src).toMatch(/useInViewport\(\s*sentinelRef\s*,\s*\{\s*rootMargin/);
        });

        it('fires onReachEnd on the visibility edge (not on every render)', () => {
            // The latest callback is stashed in a ref so the effect deps
            // are [visible] only — one fire per crossing.
            expect(src).toMatch(/onReachEndRef\.current\s*=\s*onReachEnd/);
            expect(src).toMatch(/useEffect\([\s\S]{0,120}if\s*\(visible\)\s*onReachEndRef\.current\(\)[\s\S]{0,40}\[visible\]\)/);
        });

        it('is exported from the table barrel', () => {
            expect(barrel).toMatch(/infinite-scroll-sentinel/);
        });
    });

    describe('onReachEnd threading + sentinel mount', () => {
        const types = read('src/components/ui/table/types.ts');
        const dataTable = read('src/components/ui/table/data-table.tsx');
        const table = read('src/components/ui/table/table.tsx');
        const entityListPage = read('src/components/layout/EntityListPage.tsx');

        it('onReachEnd is declared on the table props', () => {
            expect(types).toMatch(/onReachEnd\?:\s*\(\)\s*=>\s*void/);
            expect(dataTable).toMatch(/onReachEnd\?:\s*\(\)\s*=>\s*void/);
        });

        it('DataTable forwards onReachEnd to <Table>', () => {
            expect(dataTable).toMatch(/<Table[\s\S]{0,200}onReachEnd=\{onReachEnd\}/);
        });

        it('EntityListPage exposes onReachEnd on its table Pick', () => {
            expect(entityListPage).toMatch(/'onReachEnd'/);
        });

        it('Table renders the sentinel ONLY when onReachEnd is set, inside the scroll wrapper', () => {
            expect(table).toMatch(/import \{ InfiniteScrollSentinel \}/);
            // Sentinel is conditionally rendered after the table, before
            // the scroll-wrapper close.
            expect(table).toMatch(/\{onReachEnd && \(\s*<InfiniteScrollSentinel/);
        });
    });

    describe('Seven tenant list pages consume load-on-scroll', () => {
        // [client file, hasMore var, loadMore var]
        const pages: Array<[string, string, string]> = [
            [`${APP}/controls/ControlsClient.tsx`, 'hasMoreControls', 'loadMoreControls'],
            [`${APP}/risks/RisksClient.tsx`, 'hasMoreRisks', 'loadMoreRisks'],
            [`${APP}/tasks/TasksClient.tsx`, 'hasMoreTasks', 'loadMoreTasks'],
            [`${APP}/evidence/EvidenceClient.tsx`, 'hasMoreEvidence', 'loadMoreEvidence'],
            [`${APP}/assets/AssetsClient.tsx`, 'hasMoreAssets', 'loadMoreAssets'],
            [`${APP}/vendors/VendorsClient.tsx`, 'hasMoreVendors', 'loadMoreVendors'],
            [`${APP}/policies/PoliciesClient.tsx`, 'hasMorePolicies', 'loadMorePolicies'],
        ];

        for (const [file, hasMore, loadMore] of pages) {
            const name = file.split('/').pop() ?? file;
            describe(name, () => {
                const src = read(file);

                it('imports useThresholdLoadMore from the hooks barrel', () => {
                    expect(src).toMatch(
                        /import\s*\{[^}]*\buseThresholdLoadMore\b[^}]*\}\s*from\s*['"]@\/components\/ui\/hooks['"]/,
                    );
                });

                it(`passes onReachEnd={${hasMore} ? ${loadMore} : undefined} to its table`, () => {
                    // Match both JSX (`onReachEnd={…}`) and object-literal
                    // (`onReachEnd: …`) call shapes.
                    expect(src).toMatch(
                        new RegExp(`onReachEnd[=:]\\s*\\{?\\s*${hasMore}\\s*\\?\\s*${loadMore}\\s*:\\s*undefined`),
                    );
                });

                it('does NOT render the retired <TableLoadMoreFooter> button', () => {
                    expect(src).not.toMatch(/<TableLoadMoreFooter/);
                });
            });
        }
    });

    describe('Viewport-clamp: clamp-broken pages render their client directly', () => {
        // A plain-block wrapper (`<div className="space-y-section
        // animate-fadeIn">`) around the client severs ListPageShell's
        // `md:flex-1 md:min-h-0` chain, so the whole page scrolls instead
        // of the table body. These two were wrapped; both now render the
        // client directly (animate-fadeIn moved onto the shell).
        const clampFixed: Array<[string, string]> = [
            [`${APP}/assets/page.tsx`, 'AssetsClient'],
            [`${APP}/vendors/page.tsx`, 'VendorsClient'],
        ];

        for (const [file, client] of clampFixed) {
            it(`${file.split('/').slice(-2).join('/')} returns <${client}> without a wrapping <div>`, () => {
                const src = read(file);
                expect(src).toMatch(new RegExp(`return\\s*\\(\\s*<${client}`));
                expect(src).not.toMatch(
                    new RegExp(`<div className="space-y-section animate-fadeIn">\\s*<${client}`),
                );
            });
        }
    });
});
