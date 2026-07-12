/**
 * P2 — wire the risk-analytics tools to real Risk records.
 *
 * Four backend-capable pages rendered convincing shells over data islands
 * because their create forms omitted the field linking them to a Risk. This
 * ratchet locks the wiring so a "simplify" PR can't silently re-orphan them,
 * plus the scenario simulation-scope isolation (the actively-harmful bug).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

const P = (rel: string) => `src/app/t/[tenantSlug]/(app)/risks/${rel}`;

describe('P2 — scenario simulation scope isolation', () => {
    it('getLatestSimulation excludes scenario-triggered runs', () => {
        const src = read('src/app-layer/usecases/monte-carlo.ts');
        const fn = src.slice(src.indexOf('export async function getLatestSimulation'));
        expect(fn).toMatch(/triggeredBy:\s*\{\s*not:\s*'scenario'\s*\}/);
    });

    it('a scenario run persists portfolioP80 (belt-and-braces)', () => {
        const src = read('src/app-layer/usecases/risk-scenario.ts');
        expect(src).toMatch(/triggeredBy:\s*'scenario'/);
        expect(src).toMatch(/portfolioP80:\s*scenarioResult\.portfolioAle\.p80/);
    });
});

describe('P2 — shared risk picker', () => {
    it('the /risks/options endpoint + usecase exist', () => {
        expect(exists('src/app/api/t/[tenantSlug]/risks/options/route.ts')).toBe(true);
        expect(exists('src/app-layer/usecases/risk-picker.ts')).toBe(true);
        expect(read('src/app-layer/usecases/risk-picker.ts')).toMatch(/export async function listRiskOptions/);
    });
    it('the shared RiskPicker component exists', () => {
        expect(exists(P('_shared/RiskPicker.tsx'))).toBe(true);
    });
});

describe('P2 — create forms carry the risk link', () => {
    it('KRI form sends riskId + direction and renders both controls', () => {
        const src = read(P('kri/page.tsx'));
        expect(src).toMatch(/<RiskPicker\b/);
        expect(src).toMatch(/id="kri-direction"/);
        expect(src).toMatch(/riskId,\s*direction/);
    });

    it('loss-events form sends riskId and renders the picker', () => {
        const src = read(P('loss-events/page.tsx'));
        expect(src).toMatch(/<RiskPicker\b/);
        // riskId threaded into the POST body.
        expect(src).toMatch(/source,\s*\n\s*riskId,/);
    });

    it('hierarchy sends parentId and calls the risk→node links API', () => {
        const src = read(P('hierarchy/page.tsx'));
        expect(src).toMatch(/name:\s*name\.trim\(\),\s*type,\s*parentId/);
        expect(src).toMatch(/\/risks\/hierarchy\/\$\{linkNodeId\}\/links/);
        expect(src).toMatch(/<RiskPicker\b/);
    });

    it('scenarios captures per-risk overrides and sends them', () => {
        const src = read(P('scenarios/page.tsx'));
        expect(src).toMatch(/overrides:\s*overrides\.map/);
        expect(src).toMatch(/data-testid="scenario-overrides"/);
        expect(src).toMatch(/<RiskPicker\b/);
    });
});
