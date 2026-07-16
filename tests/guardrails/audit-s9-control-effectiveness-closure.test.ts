/**
 * Audit Coherence S9 (closure lock, 2026-05-27) — Gap 9 (control
 * effectiveness scoring) was shipped 2026-05-24. This ratchet locks
 * the surface so a future refactor can't silently drop the rolling
 * pass-rate aggregation or change its window default.
 *
 * The original audit (2026-05-22) flagged the lack of an
 * aggregation over `ControlTestRun` rows — auditors evaluating
 * operating effectiveness want a "pass rate over the last N runs"
 * number, but the only path was to read raw rows and compute by
 * eye. `getControlEffectiveness(controlId)` closes that.
 *
 * Effectiveness is now consolidated behind ONE canonical batched
 * function, `computeControlEffectivenessMap`, which control health,
 * control ROI, and the residual suggestion all read (each previously
 * reimplemented or ignored the query). `getControlEffectiveness`
 * remains the gated single-control convenience wrapper. This ratchet
 * follows the effectiveness signal to that canonical function so the
 * honest-null + gate + window + COMPLETED-only invariants still can't
 * silently regress.
 *
 * Locks the load-bearing pieces:
 *
 *   1. The exported `ControlEffectiveness` shape — controlId +
 *      passRate + total + passes + fails + inconclusive +
 *      windowDays.
 *   2. The 90-day default rolling window (matches the audit-
 *      readiness scoring convention).
 *   3. The canonical `computeControlEffectivenessMap` is exported and
 *      uses the Prisma `groupBy(['controlId', 'result'])` aggregation
 *      shape with the COMPLETED + executedAt-since-cutoff filters.
 *   4. The honest-null passRate (null on an empty window, never 0%).
 *   5. The `assertCanReadTests` gate on the single-control wrapper.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("Audit S9 — control effectiveness scoring (closure lock)", () => {
    const src = () => read("src/app-layer/usecases/control-test.ts");

    describe("Exported shape", () => {
        it("ControlEffectiveness interface carries the documented fields", () => {
            const s = src();
            expect(s).toMatch(/export interface ControlEffectiveness \{/);
            // Each field anchored on type so a refactor that flips
            // `passRate` from `number | null` to `number` (losing
            // the empty-window semantics) trips this.
            expect(s).toMatch(/controlId:\s*string/);
            expect(s).toMatch(/passRate:\s*number \| null/);
            expect(s).toMatch(/total:\s*number/);
            expect(s).toMatch(/passes:\s*number/);
            expect(s).toMatch(/fails:\s*number/);
            expect(s).toMatch(/inconclusive:\s*number/);
            expect(s).toMatch(/windowDays:\s*number/);
        });

        it("getControlEffectiveness is exported with the canonical signature", () => {
            expect(src()).toMatch(
                /export async function getControlEffectiveness\(\s*ctx:\s*RequestContext,\s*controlId:\s*string,\s*opts:\s*\{\s*windowDays\?:\s*number\s*\}\s*=\s*\{\},?\s*\):\s*Promise<ControlEffectiveness>/,
            );
        });
    });

    describe("Window default", () => {
        it("defaults to 90 days (matches the readiness scoring convention)", () => {
            // Changing the window changes every dashboard that
            // surfaces effectiveness — a refactor to 30 or 180 days
            // needs a deliberate decision.
            expect(src()).toMatch(
                /const DEFAULT_EFFECTIVENESS_WINDOW_DAYS\s*=\s*90/,
            );
            expect(src()).toMatch(
                /opts\.windowDays\s*\?\?\s*DEFAULT_EFFECTIVENESS_WINDOW_DAYS/,
            );
        });
    });

    describe("Canonical batched function", () => {
        it("exports computeControlEffectivenessMap as the single source of truth", () => {
            // Consolidation invariant: control health, ROI, and the
            // residual suggestion all read THIS function. A refactor
            // that un-exports it (reverting to per-caller reimplemented
            // groupBys) trips here.
            expect(src()).toMatch(
                /export async function computeControlEffectivenessMap\(/,
            );
        });

        it("defaults the window to windowDays = DEFAULT_EFFECTIVENESS_WINDOW_DAYS (90)", () => {
            // The batched function carries the same 90-day default as
            // the wrapper — every consolidated caller inherits it.
            expect(src()).toMatch(
                /windowDays:\s*number\s*=\s*DEFAULT_EFFECTIVENESS_WINDOW_DAYS/,
            );
        });
    });

    describe("Aggregation query", () => {
        it("uses Prisma groupBy on `controlId` + `result` (not a manual reduce)", () => {
            // groupBy pushes the COUNT into SQL — a refactor to
            // findMany + JS reduce would be O(n) over rows that
            // the DB can aggregate in O(log n). The `controlId` key is
            // load-bearing: it's what makes the ONE query serve N
            // controls (no N+1) for health/ROI/residual.
            const s = src();
            expect(s).toMatch(/controlTestRun\.groupBy\(/);
            expect(s).toMatch(/by:\s*\[['"]controlId['"],\s*['"]result['"]\]/);
            expect(s).toMatch(/_count:\s*\{\s*_all:\s*true\s*\}/);
        });

        it("filters to COMPLETED runs only, within the window", () => {
            // `IN_PROGRESS` and `SCHEDULED` runs aren't decisions —
            // counting them would inflate the denominator and
            // skew the pass rate. The cutoff must be present so the
            // window actually limits the result set.
            const s = src();
            expect(s).toMatch(/status:\s*['"]COMPLETED['"]/);
            expect(s).toMatch(/executedAt:\s*\{\s*gte:\s*cutoff\s*\}/);
            expect(s).toMatch(/cutoff\.setDate\(cutoff\.getDate\(\)\s*-\s*windowDays\)/);
        });

        it("passRate rounds to integer percentage; null when no runs", () => {
            const s = src();
            // The null case is essential — empty windows must not
            // surface as "0%" (which would read as "all tests
            // failed", semantically wrong). The per-entry reduce keys
            // off the map value `e`.
            expect(s).toMatch(
                /e\.total > 0\s*\?\s*Math\.round\(\(e\.passes\s*\/\s*e\.total\)\s*\*\s*100\)\s*:\s*null/,
            );
        });
    });

    describe("Authorization gate", () => {
        it("calls assertCanReadTests at the top of the single-control wrapper", () => {
            // Effectiveness data is sensitive — a refactor that
            // dropped the gate would surface pass rates to any
            // authenticated session.
            const s = src();
            const start = s.indexOf("export async function getControlEffectiveness");
            const end = s.indexOf("return runInTenantContext", start);
            expect(start).toBeGreaterThan(-1);
            expect(end).toBeGreaterThan(start);
            const head = s.slice(start, end);
            expect(head).toMatch(/assertCanReadTests\(ctx\)/);
        });
    });
});
