# 2026-06-11 — RQ3 OB-A: one voice (tenant currency, one date voice, shared pluralization)

**Commit:** _(see PR — `feat(rq3-ob-a): one voice — tenant currency, one date voice, shared pluralization`)_

## Design

Three "obsession" items grouped because they share one diagnosis: the
product spoke in multiple voices. Eleven independent sites hardcoded a
`$`-prefixed compact-money template literal (each subtly different),
breach-task descriptions wrote raw ISO date slices next to UI surfaces
using `formatDate`, and "1 days ago" grammar leaked from the staleness
engine. The fix is structural, not cosmetic — one formatter, one date
voice, one pluralizer, each held by a ratchet.

**Tenant currency.** `Tenant.currencySymbol` (`String @default("€")`,
migration `20260611220000_rq3_ob_a_tenant_currency`) flows
schema → `TenantRecord` (server context select) → tenant layout →
`TenantContextValue` → the new `useMoneyFormatter()` hook in
`src/lib/tenant-context-provider.tsx`. The hook binds the canonical
`formatCompactCurrency(v, symbol)` from `@/lib/risk-coherence` — the
ONLY place a currency string may be assembled. Nine client files that
each declared a local `const money = (n) => \`$${…}\`` now bind the
hook; the LEC chart primitive defaults its axis ticks to the canonical
formatter (pages with a tenant symbol pass their bound formatter via
`formatThreshold`). Server-side consumers (breach-task titles, score
explainer quant line, risk report CSV/PDF/PPTX) load the symbol with a
one-column `tenant.findUnique` and pass it explicitly — reports carry
`currencySymbol` on `ReportData` and bind via a `moneyFor(data)`
factory.

**One date voice.** Breach remediation-task descriptions now use
`formatDate(breach.detectedAt)` instead of `toISOString().slice(0, 10)`
— the same voice as every UI date.

**Shared pluralization.** `src/lib/pluralize.ts` (`pluralize` +
`countNoun`) replaces the local copy in `RiskMatrixCell` and fixes the
staleness engine's "last assessed 1 days ago".

## Files

| File | Role |
| --- | --- |
| `prisma/schema/auth.prisma` + migration | `Tenant.currencySymbol` column |
| `src/lib/tenant-context-provider.tsx` | `currencySymbol` on context + `useMoneyFormatter()` hook |
| `src/lib/server/tenant-context.server.ts` | select + map `currencySymbol` into `TenantRecord` |
| `src/app/t/[tenantSlug]/layout.tsx` | thread symbol into the client provider |
| 9 client files under `risks/**`, `admin/risk-appetite` | local `$` formatters deleted, hook bound |
| `src/components/ui/charts/loss-exceedance-curve.tsx` | default axis ticks via canonical formatter |
| `src/app-layer/usecases/risk-appetite.ts` | breach task title/description: tenant symbol + `formatDate` |
| `src/app-layer/usecases/risk-score-explanation.ts` | quant line speaks tenant currency |
| `src/app-layer/{usecases/risk-report.ts,reports/risk-report-render.ts}` | `currencySymbol` on `ReportData`, `moneyFor` factory in CSV/PDF/PPTX |
| `src/lib/pluralize.ts` | shared `pluralize` / `countNoun` |
| `src/lib/risk-staleness.ts`, `src/components/ui/RiskMatrixCell.tsx` | consume the shared pluralizer |
| `tests/guards/rq3-ob-a-one-voice.test.ts` | the ratchet (below) |

## Decisions

- **Hook over prop-drilling.** The symbol rides the existing tenant
  context provider — zero new providers, zero per-page plumbing. The
  hook returns a stable callback (`useCallback` on the symbol) so it
  is safe in deps arrays.
- **Server callers pass the symbol explicitly.** No AsyncLocalStorage
  magic for a display concern: breach tasks, explainer, and reports do
  a one-column tenant lookup at the boundary and hand the symbol to
  pure formatting code. Reports got a `moneyFor(data)` factory rather
  than a bound module-level `const money =` — the ratchet bans that
  declaration shape outright.
- **`€` default, no settings UI yet.** The column default matches the
  pre-existing canonical formatter default. An admin setting can land
  later as a one-field PATCH; every surface already reads the column.
- **Ratchet shape** (`tests/guards/rq3-ob-a-one-voice.test.ts`):
  bans hardcoded currency template literals outside
  `risk-coherence.ts`; bans local `const money = (n` declarations;
  pins the schema→record→context→hook flow; pins `formatDate` (and no
  ISO slices) in `risk-appetite.ts`; pins `countNoun` in the
  staleness engine. Grep patterns use `grep -rlnF -e '<pattern>'`
  single-quoted fixed strings — backtick/`$` safe.
