# 2026-07-09 — GAP-2: Redis-backed AI rate limiter + per-feature enable flags

**Commit:** _(pending)_ `feat(ai): move AI rate limiter to shared Redis + per-feature enable flags`

## Design

Two independent changes to the AI governance layer, both scoped to the
`enforceFeatureGate → checkRateLimit → … → recordGeneration` ordering
that all three AI features (risk suggestions, conversational assistant,
questionnaire autofill) already share.

### A. Shared-store rate limiter

`src/app-layer/ai/risk-assessment/rate-limiter.ts` moved from a
process-local `Map` to the shared **ioredis** singleton (`@/lib/redis`,
the same client BullMQ + caches use). The quota is now correct across
every replica of a multi-instance deployment instead of being
per-process.

- **Store abstraction.** Two internal helpers, `peek(key)` (GET + PTTL)
  and `incr(key, windowSeconds)` (INCR, then EXPIRE only when the
  counter is 1 → starts the rolling window). Each dispatches on
  `getRedis()`: a live client → Redis; `null` (no `REDIS_URL`) →
  the in-process `Map` fallback, keyed by the same strings.
- **Keys.** `airl:tenant-daily:<tenantId>` (24 h window) and
  `airl:user-rpm:<tenantId>:<userId>` (60 s window).
- **Fail-open.** A Redis throw logs and returns count 0 (check) / skips
  the record — an outage must not brick AI fleet-wide. Matches
  `credential-rate-limit.ts` / `apiReadRateLimit.ts`.
- **API is now async.** `checkRateLimit` / `recordGeneration` /
  `getUsageInfo` return promises; all three usecase callers `await`.
- **Check/record split preserved.** Read before generation, INCR only
  after success (a failed provider call doesn't consume quota). The two
  steps are non-atomic — a bounded overshoot of (concurrency − 1) under
  a burst, acceptable for a 50/day + 5/min budget and identical to the
  prior in-memory semantics.

### B. Per-feature enable flags

`feature-gate.ts` gained a `feature: AiFeature` parameter
(`'risk' | 'assistant' | 'questionnaire'`, defaults `'risk'` for
backward compatibility). The default-deny allow-list now has a second
predicate: the specific feature's flag must be on. Layering:

- `AI_RISK_ENABLED` — **global master** kill switch (unchanged
  semantics; off → every feature off).
- `AI_RISK_SUGGESTIONS_ENABLED` / `AI_ASSISTANT_ENABLED` /
  `AI_QUESTIONNAIRE_ENABLED` — per-feature, default on, ANDed with the
  master. An operator can disable one feature without touching the
  others.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/ai/risk-assessment/rate-limiter.ts` | Rewritten on the ioredis singleton + memory fallback; API async |
| `src/app-layer/ai/risk-assessment/feature-gate.ts` | `AiFeature` type + per-feature predicate + flag map |
| `src/app-layer/usecases/{assistant,questionnaire,risk-suggestions}.ts` | `await` the limiter; pass the feature to the gate |
| `src/env.ts` | Three per-feature flag env vars + runtimeEnv mapping |
| `tests/unit/ai/rate-limiter-redis.test.ts` | Redis-path proof (INCR/EXPIRE/GET/PTTL + fail-open) |
| `tests/unit/ai/feature-gate-per-feature.test.ts` | Per-feature flag isolation + master-switch override |
| `tests/unit/ai-risk-hardening.test.ts` | Memory-fallback limiter tests converted to async |
| `tests/guards/{assistant,questionnaire}-ai.test.ts` | Ordering ratchets updated for the feature arg |

## Decisions

- **ioredis, not Upstash.** The other rate limiters run at the Edge and
  use `@upstash/ratelimit`. The AI limiter is a Node/app-layer concern
  with a **readable daily counter** (`getUsageInfo` for UI) — raw INCR +
  GET + PTTL on the existing ioredis singleton is the natural fit and
  avoids standing up a second Redis binding.
- **Master switch kept as `AI_RISK_ENABLED`.** Renaming it would break
  existing prod config; its documented "global kill switch" role is
  preserved and the per-feature flags layer under it.
- **`_resetForTesting` clears only the memory store.** Redis-backed
  tests use unique tenant/user ids per case rather than flushing a
  shared Redis.
