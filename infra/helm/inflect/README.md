# inflect — Helm chart

Production-grade Helm chart for the inflect-compliance Next.js
application. Currently packages **the main app Deployment** —
Service, Ingress, HPA, ConfigMap/Secret templates, and the BullMQ
worker Deployment land in subsequent OI-2 PRs.

**Right-sizing for production:** the shipped defaults (`autoscaling:
2→10`, `worker.replicaCount: 2`) target the *medium* tier. For
tenant-count → RPS → resource guidance across small / medium / large /
enterprise tiers, see the [Production Sizing Playbook](../../../docs/sizing.md).

## Layout

```
infra/helm/inflect/
├── Chart.yaml             ← chart metadata (apiVersion v2, type application)
├── values.yaml            ← env-agnostic defaults
├── README.md              ← this file
├── .helmignore
└── templates/
    ├── _helpers.tpl       ← name/fullname/labels/selectorLabels/image helpers
    ├── deployment.yaml    ← Next.js app Deployment
    └── NOTES.txt          ← post-install operator hints
```

## Versioning

| Field | Source | Bump cadence |
|---|---|---|
| `Chart.yaml::version` | manual | When the chart's templates or default values change |
| `Chart.yaml::appVersion` | matches `package.json::version` | Lock-step with each app release |

The chart's default image tag falls back to `.Chart.AppVersion` via
the `inflect.image` helper, so bumping `appVersion` is the canonical
way to release a new app version through the chart.

## Contract

The Deployment expects two external resources in the target
namespace:

| Resource | Default name | Purpose |
|---|---|---|
| ConfigMap | `<release>-config` | Non-secret runtime env (DATABASE_HOST, REDIS_HOST, S3_BUCKET, NEXTAUTH_URL, ...) |
| Secret | `<release>-secrets` | Sensitive runtime env, sourced from AWS Secrets Manager via External Secrets Operator or CSI driver |

Override the names via `.Values.envFrom.configMap.name` and
`.Values.envFrom.secret.name`.

The chart's current iteration does NOT create these resources —
they're external. Operators provide them via:
- `kubectl apply -f` for static configs
- External Secrets Operator pulling from AWS Secrets Manager (the
  IAM policy ARN is the `runtime_secrets_read_policy_arn` output
  from Epic OI-1's terraform stack)

## Defaults

| Property | Default |
|---|---|
| Replica count | 1 |
| Container port | 3000 |
| Image | `ghcr.io/h0mele55/inflect-compliance:<chart-appVersion>` |
| Image pull policy | `IfNotPresent` |
| CPU request / limit | 1 / 2 |
| Memory request / limit | 512Mi / 1Gi |
| Liveness probe | `GET /api/livez` (initial 30s, every 15s) |
| Readiness probe | `GET /api/readyz` (initial 10s, every 10s) |
| Service account | created, automount enabled |
| Pod security context | non-root (uid 1001), `fsGroup` 1001 |
| Container security context | drop ALL capabilities, no privilege escalation |

Per-environment overrides (`replicaCount`, `resources`, `image.tag`)
land in `values-staging.yaml` / `values-production.yaml` in a
follow-up PR.

## Local validation

```bash
helm lint infra/helm/inflect

# Render with default values
helm template my-release infra/helm/inflect

# Render with overrides
helm template my-release infra/helm/inflect \
  --set replicaCount=3 \
  --set image.tag=1.36.0
```

The repo also carries a structural ratchet at
`tests/guards/helm-chart-foundation.test.ts` that fails CI if:
- any of the four canonical files (`Chart.yaml`, `values.yaml`,
  `templates/_helpers.tpl`, `templates/deployment.yaml`) goes missing
- the resource requests/limits drift off the OI-2 spec defaults
- the probes stop pointing at `/api/livez` and `/api/readyz`
- the Deployment stops using `envFrom` with both ConfigMap and Secret refs
- `Chart.yaml::appVersion` and `package.json::version` get out of sync

## Install

```bash
helm install inflect-staging infra/helm/inflect \
  --namespace inflect-staging \
  --create-namespace \
  --values values-staging.yaml      # comes in a follow-up PR
```

## Sibling chart: observability

The OTel/Prometheus/Tempo/Grafana backend is a separate umbrella chart,
[`infra/helm/observability`](../observability/README.md) (self-hosted
path). For managed Grafana Cloud instead, provision
[`infra/terraform/modules/observability`](../../terraform/modules/observability)
and set this chart's `OTEL_EXPORTER_OTLP_ENDPOINT` to the module's
`grafana_otlp_endpoint`. Decision matrix:
[`docs/observability/01-deployment-topology.md`](../../../docs/observability/01-deployment-topology.md#scale-out-provisioning-beyond-the-single-vm).
