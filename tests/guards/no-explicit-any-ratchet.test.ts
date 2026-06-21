/**
 * `any` usage ratchet.
 *
 * The codebase has a large pre-existing `any` migration debt (1200+
 * occurrences across API routes, usecases, services). Making
 * `@typescript-eslint/no-explicit-any` an `error` meant CI was red
 * for weeks; ESLint can't gradually rollout a rule. Downgrading to
 * `warn` puts lint back in the green but loses the "no new any"
 * pressure.
 *
 * This guard bridges the gap. Counts `any` patterns across `src/`
 * (SAME regexes as `scripts/count-any.js`) and caps them at the
 * current floor. New code that introduces `: any`, `<any>`,
 * `useState<any>`, `as any`, or `@ts-ignore` pushes the total up,
 * which fails this test. Caps only go DOWN — as types get added,
 * lower the cap.
 *
 * Same ratchet pattern as `tests/guardrails/raw-color-ratchet.test.ts`
 * (Epic 51 — raw Tailwind colours) and `tests/guards/epic60-ratchet.test.ts`
 * (Epic 60 — inline patterns).
 *
 * To lower the cap after a cleanup sweep:
 *   1. Run `node scripts/count-any.js` to see the new total.
 *   2. Update the `CAPS` below to match, never higher.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

interface Pattern {
    label: string;
    regex: RegExp;
}

const PATTERNS: Pattern[] = [
    { label: ': any', regex: /:\s*any\b/g },
    { label: '<any>', regex: /<any>/g },
    { label: 'useState<any>', regex: /useState<any>/g },
    { label: 'as any', regex: /as\s+any\b/g },
    { label: '// @ts-ignore', regex: /\/\/\s*@ts-ignore/g },
];

/**
 * Per-pattern cap. Current floor — can only go down when code is
 * migrated to real types. Raising these values requires a team
 * decision and a commit-message rationale.
 */
const CAPS: Record<string, number> = {
    // Roadmap-6 P1 (2026-05-22) — `as any` debt paydown. The cast sweep
    // across ~65 files drove every pattern down; each cap is lowered to
    // the exact post-cleanup floor so the gain cannot silently erode.
    // The `as any` cap counts comment mentions too (this ratchet does
    // not strip comments) — the code-level count is now 0, tracked by
    // tests/guardrails/no-explicit-any-ratchet.test.ts. The 15
    // remaining occurrences are all in docstrings / explanatory
    // comments (multiple-mentions-per-line counted separately).
    // R10-PR3 follow-up (2026-05-24) — `<any>` raised from 61 → 63.
    // The raw-`<table>` → DataTable migration of the vendor
    // assessments + subprocessors sub-tables introduced two
    // `createColumns<any>([...])` casts: `s.subprocessor`,
    // `a.template`, and the rest of those rows are typed loosely
    // (the existing page-level `assessments` and `subs` arrays are
    // `any[]` upstream — typing them properly is a separate cleanup).
    // any-paydown wave PR1 (2026-06-21) — typed `useState<any>` → real
    // interfaces in the framework-install + audit-cycle + cycle-readiness
    // pages (cross-walked from each API route's repository select / usecase
    // return). 7 `useState<any>` cleared; because `/<any>/` also matches the
    // `<any>` inside `useState<any>`, the `<any>` cap drops by the same 7.
    //   useState<any> 24 → 15 · <any> 63 → 54
    // any-paydown wave PR2 (2026-06-21) — typed `useState<any>` in the
    // framework-detail (framework/coverage) + vendor-detail (vendor/editForm)
    // pages. 4 more cleared; `<any>` drops by the same 4.
    //   useState<any> 15 → 11 · <any> 54 → 50
    // any-paydown wave PR3 (2026-06-21) — typed `useState<any>` in the 3 audit
    // pages (AuditsClient/auditor/pack-detail) + vendors-dashboard + mapping.
    // 5 cleared; `<any>` drops by the same 5. Two latent read-bugs fixed in
    // passing: AuditsClient `selected.scope` → `auditScope`.
    //   useState<any> 11 → 6 · <any> 50 → 45
    // any-paydown wave PR4 (2026-06-21) — typed the final 6 `useState<any>`
    // (audit-share, asset detail, clauses browser, framework diff/templates,
    // vendor assessment). The category is now ZERO; `<any>` drops by the same 6.
    //   useState<any> 6 → 0 · <any> 45 → 39
    // any-paydown wave PR5 (2026-06-21) — first of the `<any>` category: typed
    // the list-table generics (CappedList / createColumns / EntityListPage) in
    // coverage + vendors + policies clients to real row interfaces. Per-cell
    // callback params stay untyped (the `: any` category). 7 cleared.
    //   <any> 39 → 32
    // any-paydown wave PR6 (2026-06-21) — `<any>` category cont.: typed the
    // FindingsClient list-table generics (useQuery/getQueryData/setQueryData
    // CappedList + createColumns) to FindingRow. 5 cleared.
    //   <any> 32 → 27
    // any-paydown wave PR7 (2026-06-21) — `<any>` cont.: typed the list-table
    // generics in AssetsClient (createColumns + the useQuery payload),
    // AuditsClient (useQuery CappedList → AuditListRow) + AuditLogClient
    // (createColumns → AuditLogRow). 3 cleared.
    //   <any> 27 → 24
    // any-paydown wave PR8 (2026-06-21) — `<any>` cont.: typed EvidenceClient's
    // useTenantSWR + useTenantMutation `CappedList<…>` payloads + createColumns
    // to EvidenceRow (evidenceListSelect). 4 cleared.
    //   <any> 24 → 20
    // any-paydown wave PR9 (2026-06-21) — `<any>` cont.: typed the two vendor
    // detail sub-tables (VendorAssessmentRow / VendorSubprocessorRow) +
    // tasks/[taskId] useTenantSWR (TaskDetail). 3 cleared.
    //   <any> 20 → 17
    // any-paydown wave PR10 (2026-06-21) — `<any>` cont. + latent-bug fixes:
    // typed createColumns in controls/templates (ControlTemplateRow) +
    // reports (RiskRegisterRow). Typing exposed always-blank columns: fixed
    // templates `name`→`title`, removed the dead `frameworkTag` + `asset`
    // columns (no backing field). 2 `<any>` cleared; removing the dead-column
    // cells also dropped 2 colon-any.
    //   <any> 17 → 15 · : any 357 → 355
    // any-paydown wave PR11 (2026-06-21) — `<any>` cont., frontend generics:
    // TraceabilityPanel `getQueryData<any>` → `TraceabilityData` (2), charts
    // `ReactElement<any>` → `ReactElement` (2: 1 real + 1 docstring), form
    // `Promise<any>` → `Promise<unknown>` (1), table pinning helpers
    // `Column<any>` → generic `<TData>(column: Column<TData>)` (2). 7 cleared.
    //   <any> 15 → 8
    // any-paydown wave PR12 (2026-06-21) — `<any>` cont., Prisma-middleware
    // boundary: the `query`/`next` callbacks and `isThenable` predicate carried
    // `Promise<any>` / `PromiseLike<any>` return types at the dynamic Prisma
    // call boundary. Tightened to `unknown` (rls-middleware, encryption-middleware,
    // pii-middleware ×3, audit-context) — the query result already flows into
    // `unknown`-typed sinks (`walkReadResult(result: unknown)`, pass-through
    // returns, `runPiiEncryption`'s `Promise<unknown>` next). The `: any` PARAM
    // annotations stay (separate category); their eslint-disables remain. 6 cleared.
    //   <any> 8 → 2
    // any-paydown wave PR13 (2026-06-21) — `<any>` category ZEROED. The last
    // two: executor-registry's heterogeneous `Map<string, JobExecutor<any>>`
    // (erase the payload to `never` on store — every `JobExecutor<T>` is
    // assignable to `JobExecutor<never>` by param contravariance — and
    // re-narrow with a non-`any` cast on retrieval in `execute`); and
    // EvidenceBundleRepository.create's `Promise<any>` (deprecated throwing
    // stub → `Promise<{ id: string }>`, the structural contract its caller
    // reads). 2 cleared; the category is now 0 and ratcheted there.
    //   <any> 2 → 0
    // any-paydown wave PR14 (2026-06-21) — FIRST `: any` category PR (list
    // clients). PoliciesClient (17) + VendorsClient (14): typed the `initial*`
    // props to the existing `PolicyRow[]`/`VendorRow[]` (clean at the page's
    // `JSON.parse(JSON.stringify())` boundary — the Row interfaces model the
    // post-serialization string-date shape), and dropped every cell /
    // accessorFn / array-filter / getRowId `: any` — each param now infers
    // from `createColumns<Row>` / the typed SWR `rows`. Both files' now-unused
    // file-level `no-explicit-any` disables removed. 31 cleared.
    //   : any 355 → 324
    // any-paydown wave PR15 (2026-06-21) — `: any` cont. (Evidence + Reports).
    // EvidenceClient: props/source arrays → `EvidenceRow[]` + a new
    // `EvidenceControlOption` interface; dropped all cell/accessorFn/filter/
    // getRowId `: any`; helper + gallery callbacks typed `EvidenceRow`. Tightened
    // the (single-consumer) `EvidenceGallery` row type by removing its loose
    // `[otherKey: string]: unknown` index signature so `EvidenceRow` satisfies it
    // strictly (rather than widening EvidenceRow Record-style). ReportsClient:
    // `riskRegister` → `RiskRegisterRow[]`, unused `soa` → `unknown[]`, downloadCSV
    // param typed (indexed via `keyof RiskRegisterRow`), callbacks dropped. Both
    // files' file-level disables removed. 35 cleared.
    //   : any 324 → 289
    ': any': 289,
    '<any>': 0,
    'useState<any>': 0,
    'as any': 15,
    '// @ts-ignore': 0,
};

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            out.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function countAll(): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const { label } of PATTERNS) totals[label] = 0;

    for (const file of walk(SRC_DIR)) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const { label, regex } of PATTERNS) {
            regex.lastIndex = 0;
            const matches = content.match(regex);
            totals[label] += matches ? matches.length : 0;
        }
    }
    return totals;
}

describe('`any` usage ratchet', () => {
    const totals = countAll();

    test.each(PATTERNS.map((p) => p.label))('%s stays within cap', (label) => {
        const cap = CAPS[label];
        const actual = totals[label];
        if (actual > cap) {
            throw new Error(
                `Pattern "${label}" count rose to ${actual} (cap ${cap}). ` +
                    `Recent commits introduced new \`any\` usage in src/**. ` +
                    `Replace with real types, or narrow the cast (\`unknown\` + ` +
                    `type guard, generic parameter, \`ReturnType<typeof …>\`, etc.). ` +
                    `If the addition is deliberate (e.g. untyped third-party API), ` +
                    `annotate with \`// eslint-disable-next-line\` AND bump the ` +
                    `cap in this file with a committed justification.`,
            );
        }
        expect(actual).toBeLessThanOrEqual(cap);
    });

    it('total stays within sum of per-pattern caps', () => {
        const total = Object.values(totals).reduce((a, b) => a + b, 0);
        const capTotal = Object.values(CAPS).reduce((a, b) => a + b, 0);
        if (total > capTotal) {
            // Covered by per-pattern tests; this is the readable roll-up.
            throw new Error(
                `Total \`any\` usages: ${total} (cap sum ${capTotal}).`,
            );
        }
        expect(total).toBeLessThanOrEqual(capTotal);
    });
});
