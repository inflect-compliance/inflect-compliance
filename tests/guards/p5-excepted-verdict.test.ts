/**
 * R2-P5 — in-force control exceptions → EXCEPTED verdict (structural ratchet).
 *
 * An approved control exception applies to a CONTROL regardless of framework,
 * so it must suppress the gap in EVERY framework's coverage/readiness — not
 * only the ISO SoA. This locks the wiring:
 *   1. The EXCEPTED verdict lives in the ONE shared rollup helper.
 *   2. BOTH soa.ts and coverage.ts use it AND load in-force exceptions
 *      (APPROVED + expiresAt > now), so reversion on expiry is automatic.
 *   3. The SoA (screen + print) + control header surface EXCEPTED with the
 *      expiry, never as implemented.
 *   4. Mapping-density coverage % is unchanged (computeCoverage untouched).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const ROLLUP = 'src/lib/compliance/requirement-status-rollup.ts';
const SOA = 'src/app-layer/usecases/soa.ts';
const COVERAGE = 'src/app-layer/usecases/framework/coverage.ts';
const SOA_DTO = 'src/lib/dto/soa.ts';
const APP = 'src/app/t/[tenantSlug]/(app)';
const SOA_CLIENT = `${APP}/reports/soa/SoAClient.tsx`;
const SOA_PRINT = `${APP}/reports/soa/print/SoAPrintView.tsx`;
const EXC_PANEL = 'src/components/ControlExceptionsPanel.tsx';

describe('R2-P5 (1) EXCEPTED lives in the shared rollup', () => {
    const src = read(ROLLUP);
    it('the shared helper exports rollUpRequirementVerdict with an excepted verdict', () => {
        expect(src).toMatch(/export function rollUpRequirementVerdict/);
        expect(src).toMatch(/'excepted'/);
        expect(src).toMatch(/hasInForceException/);
    });
});

describe('R2-P5 (2) both rollups use it + load in-force exceptions', () => {
    for (const [name, file] of [['soa', SOA], ['coverage', COVERAGE]] as const) {
        it(`${name}.ts uses the shared verdict and loads APPROVED, unexpired exceptions`, () => {
            const src = read(file);
            expect(src).toMatch(/rollUpRequirementVerdict/);
            expect(src).toMatch(/exceptions:\s*\{[\s\S]*?status:\s*'APPROVED'/);
            expect(src).toMatch(/expiresAt:\s*\{\s*gt:\s*now\s*\}/);
        });
    }
});

describe('R2-P5 (3) DTO + UI surface EXCEPTED', () => {
    it('the SoA DTO carries verdict + exceptedUntil + summary.excepted', () => {
        const dto = read(SOA_DTO);
        expect(dto).toMatch(/verdict:\s*string \| null/);
        expect(dto).toMatch(/exceptedUntil:/);
        expect(dto).toMatch(/excepted:\s*number/);
    });
    it('the SoA screen renders a distinct excepted badge + summary card', () => {
        const src = read(SOA_CLIENT);
        expect(src).toMatch(/ExceptedBadge/);
        expect(src).toMatch(/verdict === 'excepted'/);
        expect(src).toMatch(/soaView\.excepted/);
    });
    it('the printable SoA labels excepted requirements with the expiry', () => {
        const src = read(SOA_PRINT);
        expect(src).toMatch(/verdict === 'excepted'/);
        expect(src).toMatch(/soaPrint\.exceptedUntil/);
    });
    it('the control header badge shows "Excepted until <date>" when in-force', () => {
        const src = read(EXC_PANEL);
        expect(src).toMatch(/inForce/);
        expect(src).toMatch(/exceptedUntil/);
    });
});

describe('R2-P5 (4) mapping-density coverage % unchanged', () => {
    it('computeCoverage still divides mapped/total (no verdict logic)', () => {
        const src = read(COVERAGE);
        // The density function must not consult the verdict/exception logic.
        const computeCoverage = src.slice(
            src.indexOf('export async function computeCoverage'),
            src.indexOf('export async function listTemplates'),
        );
        expect(computeCoverage).toMatch(/mapped\.length \/ total/);
        expect(computeCoverage).not.toMatch(/rollUpRequirementVerdict/);
    });
});

describe('R2-P5 i18n parity', () => {
    const en = JSON.parse(read('messages/en.json'));
    const bg = JSON.parse(read('messages/bg.json'));
    it('excepted keys exist in both locales', () => {
        for (const l of [en, bg]) {
            expect(l.reports.soaView.exceptedUntil).toBeTruthy();
            expect(l.reports.soaPrint.excepted).toBeTruthy();
            expect(l.panels.exceptions.exceptedUntil).toBeTruthy();
        }
    });
});
