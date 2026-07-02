# 2026-07-02 — AWS cloud-posture evidence connector (foundation)

**Commit:** `<pending> feat(integrations): aws-posture connector foundation`

## Design

A new `aws-posture` provider that turns AWS config-compliance into auto-collected
control evidence, built entirely on IC's existing integration/evidence seams —
`IntegrationConnection` (provider string + explicitly-encrypted `secretEncrypted`),
`IntegrationExecution` (the execution ledger), and the scanner-ingestion
rolling-`Evidence` + `ControlEvidenceLink` path.

```
aws-posture-collect job (payload: tenantId, connectionId)
  → runAwsPostureCollection (runInTenantContext)
      → load + decrypt connection secrets (Epic B encryptField/decryptField)
      → AwsPostureProvider.runCheck:
            execFile('powerpipe','benchmark','run',<benchmark>,'--output','json')
            creds via ENV (never argv) · scrub stdout/stderr
            parse JSON → per-control ok/alarm/skip/error
      → write ONE IntegrationExecution (bounded resultJson summary, ≤32KB)
      → per mapped PASSING control: resolve tenant control via
            ControlRequirementLink → FrameworkRequirement.code (SOC2)
            upsert rolling Evidence (category aws-posture:*, APPROVED, +30d review)
            + ControlEvidenceLink kind INTEGRATION_RESULT (integrationResultId)
```

## Decisions

- **Invoke, don't port.** `steampipe-mod-aws-compliance` is Apache-2.0, but its
  540+ checks + framework mappings are embedded in `.pp`/HCL/SQL and aren't
  cleanly extractable. Apache-2.0 permits redistribution/use of the CLI, so we
  run `powerpipe benchmark run … --output json` and consume the JSON. No HCL/SQL
  or the mod's mappings are copied — a ratchet greps the repo for `.pp` files /
  HCL control blocks as a tripwire. The mod is credited in NOTICE + the setup doc.
- **Read-only credential surface.** Creds (assume-role preferred, or a read-only
  key pair) are encrypted at rest, passed to the CLI via **environment variables
  only** (argv is world-readable in process listings), and **scrubbed** from
  captured stdout/stderr (AWS key/secret/session-token/ARN patterns + the exact
  secret values) before anything is surfaced or persisted. The secret never
  appears in logs, errors, or `resultJson`.
- **Bounded results.** `resultJson` is a summary — status counts + a per-control
  `{id,status}` array only, hard-capped at 32 KB (truncated with a flag) — never
  raw AWS resource dumps.
- **Auto-collected evidence provenance.** Only PASSING controls produce evidence
  (a pass proves the control is operating). One rolling Evidence row per
  `(control, category)` refreshes on each run; `nextReviewDate` enrolls it in the
  existing stale-review sweep so it flips to NEEDS_REVIEW if collection stops.
  Provenance is the `category` (`aws-posture:<check>`) + the linking
  `ControlEvidenceLink.integrationResultId`. Failing/alarm controls are a gap
  signal only — no risks are auto-created (a follow-on can propose-not-commit).
- **SOC 2, not NIST CSF (premise correction).** The task assumed IC already has
  `nist-csf-2.0` in its library; it does not (NIST CSF 2.0 exists only as the
  maturity-radar domain enum). IC *does* have SOC 2, and the task lists SOC 2 as
  acceptable — so the foundation maps to SOC 2 (`CC3/CC6/CC7/CC8`). The connector
  is benchmark-agnostic (`configJson.benchmark`) and the map is keyed so a
  `nistCsf` column can be added once that framework is seeded.
- **Reuse, no new model.** No schema change — `IntegrationConnection`/`Execution`
  + `Evidence`/`ControlEvidenceLink` already model everything. The provider slots
  into the existing `ProviderRegistry` (bootstrap.ts), the job into the executor
  registry; `automation-runner` also picks the provider up by automationKey.
