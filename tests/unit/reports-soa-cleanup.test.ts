/**
 * PR-V — SoA surface cleanup invariants (structural).
 *
 * The Statement of Applicability is an ISO-27001 Annex-A artifact. After the
 * reports-hub redesign the standalone `/reports/soa` surface (page + print)
 * must (a) honor the framework the user selected on the hub and (b) refuse to
 * render for a non-ISO framework. These source-level assertions lock those
 * invariants — the repo tests server pages structurally rather than by
 * executing the async server component.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP = path.resolve(__dirname, '../../src/app/t/[tenantSlug]/(app)');
const read = (p: string) => fs.readFileSync(path.join(APP, p), 'utf-8');

describe('SoA page — ISO-only guard + framework threading', () => {
    const page = read('reports/soa/page.tsx');
    const printPage = read('reports/soa/print/page.tsx');

    test.each([
        ['reports/soa/page.tsx', () => page],
        ['reports/soa/print/page.tsx', () => printPage],
    ])('%s reads ?framework, threads it to getSoA, and redirects non-ISO', (_name, get) => {
        const src = get();
        // reads the framework search param
        expect(src).toMatch(/searchParams/);
        expect(src).toMatch(/const\s*\{\s*framework\s*\}\s*=\s*await\s+searchParams/);
        // threads it into getSoA
        expect(src).toMatch(/getSoA\(\s*ctx\s*,\s*\{[\s\S]*framework[\s\S]*\}/);
        // redirects a non-ISO framework away from the SoA surface
        expect(src).toMatch(/from 'next\/navigation'/);
        expect(src).toMatch(/if\s*\(\s*!report\.isIsoFamily\s*\)/);
        expect(src).toMatch(/redirect\(`\/t\/\$\{tenantSlug\}\/reports`\)/);
    });
});

describe('Reports hub — Open SoA honors the selected framework', () => {
    const client = read('reports/ReportsClient.tsx');

    test('Open SoA link forwards ?framework=<selectedKey>', () => {
        expect(client).toMatch(/reports\/soa\?framework=\$\{encodeURIComponent\(selectedKey\)\}/);
    });

    test('readiness KPI tile renders a /100 denominator, not a bare integer', () => {
        expect(client).toMatch(/value=\{`\$\{s\.readinessScore\}\/100`\}/);
    });
});

describe('SoAClient — Print affordance + full status map', () => {
    const client = read('reports/soa/SoAClient.tsx');

    test('Print link forwards the framework to the print view', () => {
        expect(client).toMatch(/reports\/soa\/print\?framework=\$\{encodeURIComponent\(report\.framework\)\}/);
    });

    test('rollup status map covers PLANNED and IMPLEMENTING', () => {
        expect(client).toMatch(/PLANNED:/);
        expect(client).toMatch(/IMPLEMENTING:/);
    });
});

describe('Dead report API surface removed', () => {
    const apiRoot = path.resolve(__dirname, '../../src/app/api');
    const report = fs.readFileSync(
        path.resolve(__dirname, '../../src/app-layer/usecases/report.ts'),
        'utf-8',
    );

    test('orphaned GET routes are deleted', () => {
        expect(fs.existsSync(path.join(apiRoot, 't/[tenantSlug]/reports/route.ts'))).toBe(false);
        expect(fs.existsSync(path.join(apiRoot, 'reports/route.ts'))).toBe(false);
    });

    test('getReports no longer computes an SoA array', () => {
        expect(report).not.toMatch(/getSOAData/);
        // the `const soa = controls.map(...)` computation is gone (a doc
        // comment may still mention the word "soa" to explain the removal)
        expect(report).not.toMatch(/const\s+soa\s*=/);
        expect(report).toMatch(/return\s*\{\s*riskRegister\s*\}/);
    });
});
