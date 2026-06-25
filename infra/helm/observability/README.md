# inflect-observability Helm chart (PATH B — self-hosted)

Kubernetes deployment of the OTel / Prometheus / Tempo / Grafana stack —
the same topology the single-VM
[`docker-compose.observability.yml`](../../observability/docker-compose.observability.yml)
runs, repackaged as an umbrella chart. Use this for **air-gapped /
on-prem / regulated** deployments that cannot egress telemetry to a SaaS
backend.

For the **managed** alternative (lowest operational burden, recommended
for most production), use the Grafana Cloud Terraform module instead:
[`infra/terraform/modules/observability`](../../terraform/modules/observability).
The trade-off matrix is in
[`docs/observability/01-deployment-topology.md`](../../../docs/observability/01-deployment-topology.md).

## What it bundles

| Subchart | Image (pinned to compose) | Role |
|----------|---------------------------|------|
| `opentelemetry-collector` | `otel/opentelemetry-collector-contrib:0.123.0` | OTLP gateway (app pushes here) |
| `prometheus` | `prom/prometheus:v3.3.0` | metrics store + scrape |
| `tempo` | `grafana/tempo:2.7.2` | trace store (OTLP) |
| `grafana` | `grafana/grafana:11.6.0` | dashboards + explore + alerting |

Upstream **chart** versions are pinned in `Chart.yaml` `dependencies:`;
the running **image** tags are pinned in `values.yaml` to the exact
versions above, so this stack runs identical component versions to
compose.

Service names are fixed via `fullnameOverride` (`otel-collector`,
`prometheus`, `tempo`, `grafana`) so the collector exporter endpoints
and Prometheus scrape targets match the compose config verbatim.

## Dashboards — single source of truth

`./dashboards` is a **symlink** to
`infra/observability/grafana/dashboards/` (the canonical location the
compose stack mounts). `templates/dashboards-configmap.yaml` reads the
JSONs through the symlink with `.Files.Glob`, so there is **no drift**
between the two deploy paths. The ConfigMap carries the
`grafana_dashboard` label the Grafana sidecar imports. Enforced by
`tests/guardrails/observability-provisioning-coverage.test.ts`.

## Install

```bash
helm dependency update infra/helm/observability        # vendor subcharts → charts/
helm lint infra/helm/observability
helm template infra/helm/observability \
  --values infra/helm/observability/values-staging.yaml | head -50

# Staging
helm upgrade --install obs infra/helm/observability \
  -n observability --create-namespace \
  --values infra/helm/observability/values-staging.yaml

# Production
helm upgrade --install obs infra/helm/observability \
  -n observability --create-namespace \
  --values infra/helm/observability/values-production.yaml
```

Then point the app's `OTEL_EXPORTER_OTLP_ENDPOINT` at
`http://otel-collector.observability.svc.cluster.local:4318`.

## Values

- `values.yaml` — base (image pins, collector/prometheus/tempo/grafana
  config ported from compose, sane defaults, persistence off).
- `values-staging.yaml` — lean, ephemeral, 100% trace sampling.
- `values-production.yaml` — compose-matching resource caps
  (collector 512m/1cpu, prom 1g/1cpu, tempo 1g/1cpu, grafana
  512m/0.75cpu) + persistence + retention.
