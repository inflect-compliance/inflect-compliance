# 2026-06-26 — KEDA-based worker autoscaling on queue depth

**Commit:** `infra(helm): KEDA-based worker HPA on queue depth`

## Design

The BullMQ worker Deployment had fixed `replicas` (manual scaling — a known
OI-2 gap). This adds queue-depth autoscaling via KEDA: a `ScaledObject` with a
`redis` trigger reads the BullMQ `wait` list length and drives an HPA. Off by
default; production opts in (4→50). Full operator guide in
`docs/worker-autoscaling.md`.

## Decisions

- **KEDA over the Prometheus Adapter.** The `job.queue.depth` OTel gauge already
  feeds Prometheus; the Adapter could expose it to HPA. But that couples the
  observability pipeline to scaling *enforcement* — a broken metrics path would
  silently disable autoscaling. KEDA's redis scaler reads the Redis list length
  at the source, so the queue-depth metric stays informational and the scaler is
  independent.

- **PATH A — KEDA is an operator prerequisite, not a subchart.** KEDA is a
  cluster-wide controller; an application chart shouldn't install or upgrade it.
  The chart ships only the gated `ScaledObject` + `TriggerAuthentication`;
  NOTES.txt documents the `helm install kedacore/keda` prerequisite.

- **Redis wiring is values-driven (corrects the brief).** The brief's ScaledObject
  hard-coded `addressFromEnv: REDIS_HOST` + `passwordFromEnv: REDIS_PASSWORD`. This
  app connects via a single `REDIS_URL`, and KEDA's redis scaler **cannot parse a
  URL** — it needs host:port + password separately. Rather than assume env keys
  that may not exist, the address-env + password-secret-key are
  `worker.autoscaling.redis.*` knobs (defaulting to the brief's keys) with a loud
  prerequisite in the doc + NOTES.txt. This is the #1 enablement failure if
  skipped.

- **worker.yaml omits `spec.replicas` when autoscaling is on.** Same fix as the
  app deployment.yaml/hpa.yaml: if both Helm and the HPA set `replicas`, every
  `helm upgrade` resets the count and fights the autoscaler.

- **Graceful shutdown was already correct — verified, not added.**
  `scripts/worker.ts::shutdown()` already handles SIGTERM via `await
  worker.close()` (BullMQ finishes in-flight jobs), bounded by
  `terminationGracePeriodSeconds` (default 60s). The doc flags the
  grace-period-≥-longest-job tuning so scale-down doesn't SIGKILL long jobs into
  stalled-retry.

- **Scale up fast / down slow.** 100%/30s up (no stabilization), 50%/60s down with
  a 300s window — bursts absorbed immediately, drain gradual; mirrors the app HPA.

## maxReplicas cost ceiling

Worst case = `maxReplicas × pod limits`. Prod 50 × (1 vCPU / 512Mi) = 50 vCPU /
25Gi at full scale. `maxReplicas` should track the worst-*hour* arrival rate (KEDA
rides to max under sustained load) — documented in `docs/worker-autoscaling.md`.

## Validated locally

Fetched helm 3.16.4: `helm lint` clean for both value sets; `helm template`
renders 1 ScaledObject (min 4 / max 50, `bull:inflect-jobs:wait`) + 1
TriggerAuthentication in prod with the worker Deployment omitting `replicas`, and
neither + `replicas` present in staging. KEDA CRDs aren't installed in the
template step (helm renders YAML text, doesn't validate CRDs) — the live-cluster
scale + drain tests are operator steps.

## Out of scope

Per-priority scaling, cross-queue scaling, spot-instance worker nodes.
