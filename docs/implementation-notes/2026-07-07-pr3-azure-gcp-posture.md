# 2026-07-07 — PR-3: Azure + GCP cloud posture (multi-cloud abstraction)

**Commit:** _(pending)_ `feat(integrations): Azure + GCP posture providers + shared cloud-posture core`

## Design

Extends the cloud-posture connector (AWS shipped first) to Azure + GCP by
extracting the cloud-agnostic half into a shared core, so a 4th cloud is
incremental.

```
Powerpipe CLI (steampipe-mod-{azure,gcp,aws}-compliance, Apache-2.0, external)
      │ runPowerpipeBenchmark()  — cloud-agnostic: run → parse → summarise (bounded, scrubbed)
      ▼
CheckResult (counts + per-control status in details)
      │ automation-runner (live)                 │ {azure,gcp}-posture-collect job
      ▼                                          ▼
IntegrationExecution / Evidence          runCloudPostureCollection (framework rollup)
```

- **Shared core** `integrations/cloud-posture/powerpipe-core.ts`:
  `runPowerpipeBenchmark({benchmarkId, env, secretValues, patterns, exec})` — reuses
  the genuinely cloud-agnostic `parsePowerpipeBenchmarkJson` + `summariseBenchmark`
  (exported from `aws-posture-provider.ts`), plus `scrubSecrets` and
  `frameworkCodesForControl`. The `exec` seam makes it unit-testable without a CLI.
- **Providers** `AzurePostureProvider`, `GcpPostureProvider` — `ScheduledCheckProvider`s.
  Only the credential-env builder + benchmark-id map + control map differ per cloud.
  Azure passes `AZURE_*` env; GCP writes the service-account JSON to a
  `0600` temp file for `GOOGLE_APPLICATION_CREDENTIALS`, then unlinks it. Creds go
  via env, never argv; secrets are scrubbed from all output.
- **Collector** `runCloudPostureCollection` (generalized from `aws-posture.ts`) —
  tenant-scoped (`runInTenantContext`, no global prisma). Turns each PASSING
  benchmark control into rolling auto-evidence mapped to SOC 2 / NIST CSF via the
  control map + `ControlRequirementLink`. `{azure,gcp}-posture-collect` jobs delegate.
- **Registration** — both providers in `bootstrap.ts`; the admin/integrations UI
  renders `configSchema` dynamically, so connect/test UI is free.

## Scope

**Config posture only** (the roadmap's documented option). No cloud-native
vuln-finding ingestion, so **no new Prisma model / migration** — nothing to add to
RLS / retention. A `ScannerFinding`-style ingestion is a clean future extension.

## Files

| File | Role |
| --- | --- |
| `integrations/cloud-posture/powerpipe-core.ts` | shared run→parse→summarise + scrub + framework-codes |
| `integrations/providers/azure-posture-provider.ts` | Azure provider |
| `integrations/providers/gcp-posture-provider.ts` | GCP provider (temp-file SA cred) |
| `data/integrations/{azure,gcp}-posture-control-map.ts` | SOC 2 / NIST CSF crosswalks |
| `usecases/cloud-posture.ts` | generic tenant-scoped collector |
| `jobs/cloud-posture-collect.ts` + `jobs/{types,executor-registry}.ts` | collector jobs |
| `integrations/bootstrap.ts` | provider registration |

## Decisions

- **Reuse over refactor.** The AWS provider keeps its own internals; the shared core
  imports its cloud-agnostic exports rather than moving them (no risk to the AWS
  connector's guard test). Migrating AWS onto the shared core is an optional cleanup.
- **GCP temp-file credential.** steampipe's GCP plugin reads a file path, so the SA
  JSON is written `0600` and unlinked in a `finally`. Only the live path writes a
  file; the `exec` seam bypasses it in tests.
- **Collectors are not scheduled.** Like `aws-posture-collect`, they are enqueued
  per-connection (tenant-scoped), so no `SCHEDULED_JOBS` entry and no job-count churn.
