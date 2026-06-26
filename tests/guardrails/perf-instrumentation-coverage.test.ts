/**
 * Perf-instrumentation coverage ratchet.
 *
 * Locks in the four measurement surfaces (RUM, slow-query log, bundle
 * analyzer, baseline dir) so a later refactor can't silently remove the
 * instrumentation every subsequent perf phase depends on for its
 * before/after numbers.
 *
 * See docs/implementation-notes/2026-06-26-perf-baseline.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

describe('perf instrumentation coverage', () => {
    describe('RUM', () => {
        it('rum.ts exists and exports initRum', () => {
            expect(exists('src/lib/observability/rum.ts')).toBe(true);
            expect(read('src/lib/observability/rum.ts')).toMatch(/export function initRum/);
        });

        it('the /api/rum route exists with a POST handler', () => {
            expect(exists('src/app/api/rum/route.ts')).toBe(true);
            expect(read('src/app/api/rum/route.ts')).toMatch(/export const POST/);
        });

        it('the root layout mounts the RUM client', () => {
            const layout = read('src/app/layout.tsx');
            expect(layout).toMatch(/RumInit/);
            expect(exists('src/components/observability/RumInit.tsx')).toBe(true);
        });
    });

    describe('slow-query log', () => {
        it('prisma.ts enables query events', () => {
            const prisma = read('src/lib/prisma.ts');
            expect(prisma).toMatch(/level:\s*'query'\s*,\s*emit:\s*'event'/);
            // and actually listens for them
            expect(prisma).toMatch(/\$on\(\s*'query'/);
        });
    });

    describe('metrics', () => {
        const metrics = read('src/lib/observability/metrics.ts');
        for (const name of [
            'web_vitals.lcp_ms',
            'web_vitals.fcp_ms',
            'web_vitals.inp_ms',
            'web_vitals.ttfb_ms',
            'web_vitals.cls',
            'db.slow_query.count',
        ]) {
            it(`declares the ${name} instrument`, () => {
                expect(metrics).toContain(name);
            });
        }
    });

    describe('bundle analyzer', () => {
        it('next.config.js wraps in withBundleAnalyzer', () => {
            const cfg = read('next.config.js');
            expect(cfg).toMatch(/@next\/bundle-analyzer/);
            expect(cfg).toMatch(/withBundleAnalyzer\(/);
        });

        it('package.json has an analyze script + the dev dependency', () => {
            const pkg = JSON.parse(read('package.json')) as {
                scripts: Record<string, string>;
                devDependencies: Record<string, string>;
            };
            expect(pkg.scripts.analyze).toMatch(/ANALYZE=true/);
            expect(pkg.devDependencies['@next/bundle-analyzer']).toBeDefined();
            expect((JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies['web-vitals']).toBeDefined();
        });
    });

    describe('baseline', () => {
        it('docs/perf/ directory exists', () => {
            expect(exists('docs/perf')).toBe(true);
            expect(fs.statSync(path.join(ROOT, 'docs/perf')).isDirectory()).toBe(true);
        });
    });
});
