# Worker autoscaling — KEDA on queue depth

> **New to the codebase?** Start at [CONTRIBUTING.md](../CONTRIBUTING.md).

The BullMQ worker Deployment autoscales by **queue depth** via KEDA. Off by
default; production enables it. When off, the worker keeps its fixed
`replicaCount` (manual scaling, as before).

## Why KEDA (not the Prometheus Adapter)

The `job.queue.depth` metric already exists (OTel observable gauge,
`src/lib/observability/metrics.ts`) and surfaces in Prometheus. Two ways to feed
it into HPA:

- **Prometheus Adapter** — expose `job.queue.depth` to `external.metrics.k8s.io`;
  HPA consumes it. Reuses the observability stack, but **couples observability to
  scaling policy** — the metric pipeline becomes load-bearing for enforcement.
- **KEDA** (chosen) — a purpose-built `redis` scaler reads the BullMQ list length
  directly and drives an HPA. The queue-depth *metric* stays informational; the
  ScaledObject is the canonical scaler. Decoupled, ~one ScaledObject of YAML.

KEDA wins here: the scaling signal (Redis list length) is read at the source, so
a broken metrics pipeline never silently disables autoscaling.

## How it scales

- **Trigger:** KEDA `redis` scaler on `bull:inflect-jobs:wait` (the BullMQ waiting
  list — `<prefix>:<QUEUE_NAME>:wait`).
- **Target:** `targetQueueDepth` waiting jobs per worker (default 50). Replicas =
  `ceil(waiting / targetQueueDepth)`, clamped to `[minReplicas, maxReplicas]`.
- **Cadence:** polls every `pollingInterval` (30s). A burst sustains ~30s before
  the scaler reacts — this is **not** sub-30s reactive.
- **Shape:** scale **up fast** (100%/30s, no stabilization), scale **down slow**
  (50%/60s, 300s stabilization) — absorb bursts immediately, drain gradually.
- **Prod:** `minReplicas 4 → maxReplicas 50`. Staging: disabled.

## Prerequisites (operator)

1. **KEDA installed cluster-wide** (PATH A — the app chart does NOT manage the
   KEDA controller):

   ```
   helm repo add kedacore https://kedacore.github.io/charts
   helm install keda kedacore/keda -n keda --create-namespace
   ```

2. **Redis host + password as separate keys.** The app connects via a single
   `REDIS_URL`, but KEDA's redis scaler **cannot parse a URL** — it needs
   `address` (host:port) + password separately. Before enabling, ensure the
   worker's env/secret exposes them (or override the knobs):
   - `worker.autoscaling.redis.addressFromEnv` (default `REDIS_HOST`) must resolve
     to **host:port** in the worker pod's env.
   - `worker.autoscaling.redis.passwordSecretKey` (default `REDIS_PASSWORD`) must
     be a key in the envFrom secret.

   If your secret only has `REDIS_URL`, add `REDIS_HOST` (host:port) + a
   `REDIS_PASSWORD` secret key, or point these knobs at whatever keys you do
   expose. **This is the most common enablement failure.**

## Graceful shutdown (scale-down correctness)

Scale-down sends SIGTERM to a worker pod. `scripts/worker.ts` handles it:
`shutdown()` calls `await worker.close()` (BullMQ stops accepting new jobs and
finishes in-flight ones) then drains telemetry. This is bounded by the pod's
`terminationGracePeriodSeconds` (default **60s**, `worker.terminationGracePeriodSeconds`).

**Set the grace period ≥ your longest job.** Most jobs finish in seconds; the
heaviest (framework-pack install ~60s, key/DEK-rotation sweeps) can run longer.
If a job exceeds the grace period it's SIGKILLed mid-run — BullMQ marks it
**stalled and retries** it (correct, but noisy). Tune `terminationGracePeriodSeconds`
up in prod if your job mix runs long.

## Failure modes

- **Queue stuck (Redis up, jobs not being claimed).** KEDA sees a growing list and
  scales to `maxReplicas` even though adding workers won't help (the jobs aren't
  being claimed — a bug, a poisoned job, a dependency outage). Symptom: an
  autoscale-to-max that doesn't drain. **Operator action required** — this is not
  a scaling problem; investigate why jobs aren't being processed.
- **BullMQ key layout changes.** The trigger is pinned to `bull:<queue>:wait`. If
  a BullMQ upgrade changes that key, the scaler reads an empty/missing list and
  **silently never scales up**. Pin the BullMQ version this list-name targets;
  re-verify on every BullMQ major bump.

## Cost ceiling

Worst case = `maxReplicas × worker pod resources`. Prod: 50 × (1 vCPU / 512Mi
limit) = 50 vCPU / 25Gi at full scale. Size `maxReplicas` to the **worst-hour job
arrival rate**, not the absolute peak — KEDA will ride to max under sustained
load, and that's the bill.

## Out of scope

- **Per-priority scaling** — BullMQ supports priority; the redis scaler reads
  total list length only.
- **Cross-queue scaling** — one queue today (`inflect-jobs`); a second queue adds
  a second trigger.
- **Spot instances for workers** — a node-pool design, not a chart change.

## Verification

- `helm lint infra/helm/inflect --values values-production.yaml` — clean.
- `helm template ... --values values-production.yaml` renders one `ScaledObject`
  (min 4 / max 50) + one `TriggerAuthentication`, and the worker Deployment OMITS
  `spec.replicas`. Staging renders neither and keeps `replicas`.
- In a cluster: enqueue 500 jobs → `kubectl get hpa -n inflect-production` shows
  the KEDA-managed HPA scaling the worker toward `targetQueueDepth`.
- Drain test: `kubectl delete pod <worker>` mid-job → BullMQ marks the job for
  retry, not failure.
- `npx jest tests/guardrails/worker-autoscaling-coverage.test.ts`.
