# 2026-07-01 — Continuous vendor monitoring + breach intelligence

**Commit:** `<pending> feat(vendor): continuous monitoring + breach intelligence`

## Design

A vendor assessment is a point-in-time snapshot that goes stale the moment
it's signed. This wave adds the always-on companion: a daily sweep that
re-checks each vendor's posture across three **free/public** signal families
and, when posture changes, takes action — moving IC from "assessed once" to
"continuously assured".

```
vendor-monitoring job (daily 02:00 UTC)
  └─ for each enabled VendorMonitor (system ctx per tenant)
       runVendorMonitor(ctx, {vendorId})
         1. ATTESTATION  evaluateAttestations(parsed SOC2/cert periods, now)
              EXPIRED  → nextReviewAt=now (stale) + REASSESSMENT_TRIGGERED
                         + (opt-in) Finding[VENDOR_ATTESTATION_EXPIRED] + notify
         2. BREACH       getBreachProvider().check(domain)   [fetchWithRetry]
              new hit  → nextReviewAt=now + BREACH_DETECTED
                         + (opt-in) Finding[VENDOR_BREACH] + notify
         3. TLS/HEADERS  getTlsProvider().grade(domain)       [fetchWithRetry]
              change   → TLS_GRADE timeline event + rolling state
         └─ every change → one idempotent VendorPostureEvent (fingerprint)
  └─ runVendorReassessmentReminder()   ← reuses the (previously-orphaned) sweep
```

**Two models.** `VendorMonitor` (1:1 per vendor — which checks are on +
rolling state: last run, breach date, TLS grade, attestation expiry).
`VendorPostureEvent` (append-only timeline — the continuous-assurance record;
`@@unique([tenantId, fingerprint])` makes recurring signals idempotent,
`createdFindingId` links the materialised Finding).

**Rides existing seams, no parallel paths.**
- External signals mirror `vendor-enrichment.ts`: a provider interface + a
  deterministic CI-safe `TestMode…` stub (the default) + a real provider that
  calls the shared `fetchWithRetry`. Breach = keyless public HIBP breach
  catalog filtered by domain; TLS = a public security-header grade of the
  homepage (SSL-Labs-style, free).
- Findings materialise through the existing `createFinding` usecase with a
  `VENDOR_*` `sourceKind` (the only Finding↔Vendor linkage the schema has),
  idempotent by `(sourceKind, sourceRef)` — the same shape vendor-doc
  exceptions use.
- The reassessment cadence reuses `runVendorReassessmentReminder` (finally
  wired into a schedule via this job) rather than a second implementation.

**Propose-not-commit stance carried forward.** Monitoring ALWAYS records the
timeline + notifies the owner, but a scored **Finding** only materialises when
the tenant opts in via `VendorMonitor.materializeFindings` (default off) —
mirroring the vendor-doc "nothing scored silently" contract.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/vendor.prisma` | `VendorMonitor` + `VendorPostureEvent` models |
| `prisma/schema/enums.prisma` | `NotificationType.VENDOR_POSTURE_ALERT` |
| `prisma/migrations/20260701150000_vendor_monitoring/` | tables + RLS triple + FKs + enum value |
| `src/app-layer/services/vendor-monitoring/types.ts` | signal + provider contracts |
| `…/vendor-monitoring/evaluate.ts` | pure evaluators (attestation expiry, header grade, breach freshness) |
| `…/vendor-monitoring/breach-provider.ts` | stub + HIBP-domain breach provider |
| `…/vendor-monitoring/tls-provider.ts` | stub + header-grade TLS provider |
| `src/app-layer/usecases/vendor-monitoring.ts` | `runVendorMonitor` / `getVendorPosture` / `updateVendorMonitor` |
| `src/app-layer/jobs/vendor-monitoring.ts` | daily sweep (system ctx per tenant) + reassessment reminder |
| `src/app-layer/jobs/{types,executor-registry,schedules}.ts` | job wiring (3 seams) |
| `src/app/api/t/[tenantSlug]/vendors/[vendorId]/monitor/{route,run/route}.ts` | GET posture / PATCH config / POST run-now |
| `src/app-layer/usecases/vendor.ts` | `getVendorMetrics` += expiredAttestations / recentBreachActivity / overdueReassessment |
| `…/vendors/[vendorId]/_components/VendorMonitoringPanel.tsx` | monitor state card + posture timeline + run-now |
| `…/vendors/dashboard/page.tsx` | "Continuous assurance" KPI row |
| `src/env.ts` | `VENDOR_MONITOR_ENABLED` + provider vars |

## Decisions

- **"Flips the vendor's status" = forces reassessment-due.** `VendorStatus`
  (ACTIVE/ONBOARDING/OFFBOARDING/OFFBOARDED) has no "compromised" member, so a
  breach / expired attestation sets `nextReviewAt = now` — the concrete,
  already-surfaced "needs reassessment" state (dashboard "Overdue
  Reassessment") — rather than misusing the lifecycle enum.
- **Findings opt-in, timeline always.** Auto-creating scored findings from an
  external feed on every tenant would be noisy + occasionally wrong;
  `materializeFindings` defaults off. The posture timeline + owner
  notification are the always-on signal.
- **Free public signals only.** Keyless HIBP breach catalog + homepage
  security-header grade. Paid security-rating integrations
  (SecurityScorecard, BitSight) are a deliberate **future connector** — noted,
  not built. No active scanning of vendor infrastructure (public signals +
  attestation expiry only).
- **One attempt, self-healing.** The sweep is idempotent (events dedupe by
  fingerprint, findings by sourceRef, notifications by dedupeKey) and re-runs
  daily, so `attempts: 1` avoids a retry storm against the public feeds; a
  transient failure heals on the next cycle.
- **Kill-switch.** `VENDOR_MONITOR_ENABLED=0` no-ops the sweep for air-gapped
  deployments that can't reach the public feeds.
