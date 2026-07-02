# 2026-07-02 — AI compliance-posture hero

**Commit:** `<pending>` feat(dashboard): AI compliance-posture summary hero

## Design

Replaces the dashboard masthead's raw 72px control-coverage % with a
tenant-wide **AI compliance-posture summary**: a `postureLabel` +
`maturityScore` headline, a short narrative, and 2-3 prioritized next
actions. Coverage % is preserved as a secondary stat.

The summary is **generated once/day per tenant by a cron and CACHED in the
DB**; the hero reads the cached row cheaply. The LLM is NEVER called on the
render path — only in the daily cron and the explicit regenerate endpoint.

```
 daily cron (05:30 UTC)
   compliance-posture-summary-dispatch  (cross-tenant fan-out)
        └─ enqueue per active tenant ─▶ compliance-posture-summary { tenantId }
                                              │
              gatherPostureSignals(ctx) ◀─────┘  (reuses getExecutiveDashboard
                       │                            + per-framework coverage)
                       ▼
              provider.generate(signals)   ── AI_POSTURE_PROVIDER:
                       │                        stub (default) | anthropic | openrouter
                       ▼
              applyPostureOutputGuard()    ── clamp label/score, ≤5 advice, sanitize
                       ▼
              upsert CompliancePostureSummary (1 row/tenant, RLS-bound)

 dashboard render:  GET .../dashboard/posture-summary  → cached row (or null)
                    null  ⇒ fall back to the classic coverage-% <HeroMetric>
```

### Providers (opt-in LLM, deterministic by default)

`AI_POSTURE_PROVIDER` (default `stub`) selects the provider; the factory falls
back to the stub on any misconfiguration, and each LLM provider self-falls-back
to the deterministic summary on any runtime error (two-layer backstop).

- **stub** — deterministic, no network, no key. Derives `maturityScore` from
  coverage anchored + operational-hygiene penalties (critical/high risks,
  overdue evidence/tasks/reviews), maps to a `postureLabel`, writes a templated
  narrative, and produces 2-3 concrete advice items from the biggest gaps. This
  is the zero-config default and MUST always work.
- **anthropic** — direct Claude Messages API (`x-api-key`,
  `anthropic-version: 2023-06-01`), model `ANTHROPIC_MODEL`
  (default `claude-haiku-4-5`), `max_tokens: 600`, ~15s timeout.
- **openrouter** — reuses the OpenRouter call shape (`OPENROUTER_API_KEY` /
  `OPENROUTER_MODEL`, default `anthropic/claude-3.5-haiku`).

Both LLM providers ask for STRICT JSON, parse defensively (`parse.ts`,
back-filling a missing score from the deterministic derivation), then the
usecase runs the output-guard before persisting. Cost is one small-model call
per tenant per day (haiku-class) — the stub is free.

### Signals (all aggregate — no entity text/PII leaves the process)

`gatherPostureSignals` reuses `getExecutiveDashboard(ctx)` (control coverage,
risk severities, evidence freshness, task/policy/vendor/finding counts) plus a
single per-framework coverage pass (one tenant-scoped read of the
control ⇄ requirement links, grouped in memory). Every field sent to a model is
a count/percent or a catalog framework label — see
`ai/compliance-posture/privacy.ts`.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `CompliancePostureSummary` model (1 row/tenant, `@@unique([tenantId])`) |
| `prisma/migrations/20260702120000_compliance_posture_summary/migration.sql` | Table + indexes + FK + canonical RLS triple |
| `src/app-layer/ai/compliance-posture/*` | types · provider factory · stub · anthropic · openrouter · prompt-builder · parse · output-guard · privacy |
| `src/app-layer/usecases/compliance-posture.ts` | `gatherPostureSignals` · `generate…` · `getLatest…` · cron-context builder · DTO mapper |
| `src/app-layer/jobs/compliance-posture-summary.ts` | per-tenant runner + cross-tenant dispatch fan-out |
| `src/app-layer/jobs/{types,executor-registry,schedules}.ts` | payloads + executors + daily schedule (05:30 UTC) |
| `src/app/api/t/[tenantSlug]/dashboard/posture-summary/route.ts` | GET cached summary (canRead) |
| `src/app/api/t/[tenantSlug]/dashboard/posture-summary/regenerate/route.ts` | POST on-demand regenerate (`reports.export`) |
| `src/app/t/[tenantSlug]/(app)/dashboard/PostureHeroCard.tsx` | masthead hero (label/score/narrative/advice + coverage secondary + regenerate) |
| `src/app/t/[tenantSlug]/(app)/dashboard/{DashboardClient,page}.tsx` | wire hero + SSR/SWR fetch + fallback |
| `src/env.ts` | `AI_POSTURE_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| `docs/data-retention.md` | classified Operational/derived (daily-regenerated) |

## Decisions

- **Two-job fan-out (SharePoint pattern), not a single cross-tenant sweep.**
  The per-tenant `compliance-posture-summary` job carries `{ tenantId }` and
  references it (satisfies the job-isolation guard); the daily
  `…-dispatch` job enumerates active tenants and enqueues one each (exempt
  cross-tenant fan-out, same class as `sharepoint-delta-sync-dispatch`).
- **Cached row, hero never calls the LLM.** Generation is out-of-band (cron +
  explicit regenerate). The hero reads a cached row and degrades to the
  classic coverage-% `<HeroMetric>` when the row is absent — never a blank or
  perpetual spinner.
- **`<HeroMetric>` stays mounted in `DashboardClient` (the fallback branch)**
  rather than inside `PostureHeroCard`, to respect the masthead-discipline and
  HeroMetric-canonical-home ratchets (the 72px primitive keeps one home).
- **Not encrypted, but sanitized.** The narrative/advice are aggregate,
  non-sensitive prose derived from already-visible KPIs — outside the Epic B
  encrypted-fields manifest — but the output-guard runs `sanitizePlainText`
  before persist (defence at the storage layer).
- **`postureLabel` is a plain String, not a Prisma enum**, so an unforeseen
  provider label can't hard-fail the row; the output-guard clamps it into the
  known set.
- **org-maturity NOT wired.** It is org-scoped (needs an `OrgContext`), not
  tenant-scoped, so `maturityAverage` is left null and the stub derives the
  score from coverage + hygiene instead.
