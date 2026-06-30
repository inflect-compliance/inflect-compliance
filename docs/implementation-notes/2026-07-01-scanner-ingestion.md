# 2026-07-01 — SARIF scanner ingestion + automated control evidence

**Commit:** `<pending> feat(security-testing): SARIF scanner ingestion + automated control evidence`

## Why / credit

Concept surfaced by **qasl-test-security (MIT)** — specifically its
scanner-output ingestion idea. We did **not** port the tool: its CFQI
proprietary composite score and forensic-PDF framing were explicitly
rejected (IC has its own scoring + reporting). What we took is the *gap
it revealed*: IC's evidence was 100% manual, with no Vanta/Drata-style
**automated evidence**. This PR builds that natively, as the first
connector of IC's existing "external security signal → compliance graph"
subsystem.

## Design

Three artefacts out of one SARIF upload:

```
  CI scanner (Semgrep/Trivy/ZAP/gitleaks/Checkov/CodeQL)
        │  emits SARIF 2.1.0
        ▼
  POST /api/t/:slug/security-testing/ingest
        │
        ├─ parseSarif()  ── pure normaliser ──▶ NormalizedScannerFinding[]
        │     severity matrix · CWE extraction · fingerprint dedup
        │
        ├─ ScannerRun + ScannerFinding (upsert by (tenant,fingerprint))
        │
        ├─ PASS + mapped control ─▶ Evidence + ControlEvidenceLink
        │     (kind INTEGRATION_RESULT)  ── automated control evidence
        │
        └─ findings ≥ threshold ─▶ createFinding(sourceKind='SCANNER')
              re-scan: idempotent; fixed finding ─▶ Finding CLOSED
```

### SARIF as the canonical format
SARIF (OASIS v2.1.0) is what virtually every scanner emits, so we wrote
**one** parser (`services/sarif.ts`) instead of a parser per tool.
Trivy-JSON / ZAP-XML adapters are only worth adding if a tool's SARIF is
lossy — and they would convert *to* the `NormalizedScannerFinding` shape,
never fork a second path.

### Automated-evidence pattern (IC's first — reusable seam)
A passing run upserts **one rolling Evidence row per (control, source)**
(keyed by `category = scanner:<source>`), refreshed on each scan, status
`APPROVED`, with a `nextReviewDate` freshness window. That window means
the **existing** evidence stale-review sweep flips it to `NEEDS_REVIEW`
if scans stop — no new freshness code. The bridge into the control
evidence tab is `ControlEvidenceLink` `kind = INTEGRATION_RESULT` +
`integrationResultId = <run>`. Future signal sources (cloud-config, IdP)
plug into this same shape: *resolve control → upsert rolling evidence →
set freshness*.

### Failing findings — unified with the CVE path
Findings at/above the threshold (default HIGH) materialise into the
**existing** `Finding` model via `createFinding`, tagged
`sourceKind='SCANNER'` / `sourceRef=<fingerprint>` — the identical
idempotent-materialiser pattern that `vulnerability.ts` (`sourceKind='CVE'`)
and `nis2-readiness.ts` use. Re-scanning is idempotent; a finding that
drops out of the scan is reconciled `CLOSED`. This is NOT a parallel
finding-ingestion path.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `ScannerRun` + `ScannerFinding` models (sibling to `Cve`/`AssetVulnerability`) |
| `prisma/migrations/20260701120000_scanner_ingestion/` | tables + indexes + FKs + RLS triple |
| `src/lib/security/encrypted-fields.ts` | `ScannerFinding.description` encrypted (Epic B) |
| `src/app-layer/services/sarif.ts` | canonical SARIF → normalised findings (pure) |
| `src/app-layer/services/cwe-mapping.ts` | CWE → OWASP Top 10 / SSDF cross-walk (reference data, not a score) |
| `src/app-layer/usecases/scanner-ingestion.ts` | ingest + dedup + automated evidence + reconciling Findings |
| `src/app/api/t/[tenantSlug]/security-testing/{ingest,runs,findings}/route.ts` | push + read API |
| `tests/guardrails/scanner-ingestion-coverage.test.ts` | structural ratchet (the 6 invariants) |
| `tests/unit/sarif-parser.test.ts` | parser severity/CWE/fingerprint/tool proofs |

## Decisions

- **No proprietary composite score.** A black-box grade undermines a
  compliance product's defensibility. Scanner coverage is expressed as
  control-evidence completeness (transparent, framework-tied), never an
  opaque index. The ratchet fails CI if a `CFQI`/`compositeScore`/`grade`
  is introduced.
- **Evidence only on PASS.** A failing scan is not evidence the control
  operates — it produces *findings*, not evidence. "Scan ran, 0 at/above
  threshold" is the operating evidence.
- **Auto-APPROVED automated evidence.** Matches the Vanta/Drata model —
  the point of automated evidence is that it doesn't need manual
  collection. The freshness window keeps it honest (goes stale if scans
  stop).
- **Rolling evidence row, not one-per-scan.** Upsert by (control, source)
  so daily scans refresh a single record instead of accumulating 365
  rows/control/year.
- **Triage status preserved on re-scan.** A finding marked
  `FALSE_POSITIVE`/`ACCEPTED` is not silently reopened by the upsert.

## Market gate (recorded)

This is valuable for tenants who build software / run DevSecOps scanners,
and it pairs with the SSDF framework (PW.8 test, RV vulnerability
response). SSDF is **not currently installed** in IC, so the scanner →
control mapping is purely tenant-configured (via the scanner
`IntegrationConnection.configJson.controlMappings`); when an SSDF
framework lands, tenants map scanners to its practice controls. Pure
org-GRC tenants who don't ship software can ignore the surface.

## Follow-ups (explicitly out of this PR)

- Webhook ingestion (GitHub Actions / GitLab CI → `IntegrationWebhookEvent`
  → `webhook-processor`) — the push API is the canonical path; the
  webhook variant reuses the same `ingestScannerRun` usecase.
- The full `/t/:slug/security-testing` dashboard view + the per-control
  "evidence from scans" tab + the dashboard signal — the API + data layer
  ship here; the rich UI is a fast-follow.
- An SSDF framework/control-template pack (so the scanner→control mapping
  has an out-of-box default).
- Unify with SBOM ingestion when that lands — same subsystem, same
  `ScannerRun.scanType='SCA'` shape.
