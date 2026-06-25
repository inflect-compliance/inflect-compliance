# 2026-06-25 — Observability provisioning (Terraform module + Helm chart)

**Commit:** `<pending>` infra(observability): terraform module + helm chart for the OTel/Prom/Grafana stack

## Problem

The observability stack was a compose-only deployment co-located on the
app VM (`infra/observability/docker-compose.observability.yml`). It was
invisible to `infra/terraform/modules/*` (database/redis/secrets/storage/
vpc — no observability) and had no Helm chart, so a Kubernetes
deployment of the app had nowhere to point its OTLP exporter, and a
future move off the single VM would strand the telemetry surface.

## Shape

Two complementary provisioning paths, same OTLP/HTTP telemetry shape:

- **PATH A — `infra/terraform/modules/observability/`** — managed
  Grafana Cloud (Loki+Tempo+Mimir+Grafana). Outputs the OTLP endpoint +
  Basic-auth token (sensitive, persisted to Secrets Manager) +
  workspace URL + the direct prom-remote-write / tempo / loki URLs.
- **PATH B — `infra/helm/observability/`** — umbrella Helm chart
  wrapping the four upstream charts, repackaging the compose topology
  for self-hosted k8s.

Plus a topology-doc "scale-out" section documenting the three paths
(compose / self-hosted Helm / Grafana Cloud) with a trade-off matrix.

## Decisions

### Grafana Cloud vs AWS Managed (PATH A provider choice)

Picked **Grafana Cloud** (`grafana/grafana` provider, `grafana_cloud_stack`
+ a write-only `grafana_cloud_access_policy_token`):

- **Single vendor** for all three signals (metrics/logs/traces) +
  dashboards — no stitching AMP (metrics) to a separate logs/traces
  story.
- **Native OTLP** gateway — the app already speaks OTLP/HTTP, so the
  endpoint is a drop-in; auth is a Basic-auth header.
- **Lowest ops burden** — vendor-run, effectively unbounded retention.
- The write token is scoped to `metrics:write`/`logs:write`/`traces:write`
  only and realm-locked to the one stack — a leaked token can ship
  telemetry but cannot read data or mutate config.

The documented alternative (in `main.tf`'s header + the module): **AWS
Managed Prometheus + AWS Managed Grafana** (`aws_amp_workspace` +
`aws_grafana_workspace`) gives the same telemetry shape but trades the
single-vendor simplicity for AWS lock-in and a metrics-only AMP (logs/
traces need a separate path). Pick it only under a procurement
constraint; the module's outputs stay stable so the swap is contained.

### Dashboard single source of truth

The three dashboards (`inflect-api-overview`, `inflect-jobs-and-queues`,
`observability-stack-health`) must not drift between compose and Helm.
Canonical location stays `infra/observability/grafana/dashboards/` (the
compose volume mount, unchanged). The Helm chart's `dashboards/` is a
**symlink** to it; `templates/dashboards-configmap.yaml` reads the JSONs
through the symlink with `.Files.Glob` and emits a ConfigMap carrying the
`grafana_dashboard` label the Grafana sidecar imports. So both paths
serve byte-identical dashboards from one location — enforced by the
`observability-provisioning-coverage` ratchet (asserts the JSONs exist in
exactly one real location and the Helm path is a symlink, not copies).

### Version parity

Upstream **chart** versions are pinned in `Chart.yaml` `dependencies:`;
the running **image** tags are pinned in `values.yaml` to the exact
versions the compose stack runs (collector 0.123.0, prometheus v3.3.0,
tempo 2.7.2, grafana 11.6.0). `fullnameOverride` fixes service DNS to the
compose service names so the ported collector config + Prometheus scrape
targets are verbatim.

## Out of scope (follow-ups)

- Migrating prod off compose to k8s (this ships the option).
- Wiring `docs/slos.md` SLOs as Grafana SLO objects.
- On-call routing (PagerDuty/Opsgenie) for the existing alerting rules.

## Verification

`terraform validate`, `helm lint`, `helm template` (CI — neither tool is
in the local image), and the
`observability-provisioning-coverage.test.ts` structural ratchet.
