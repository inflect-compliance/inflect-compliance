# 2026-06-25 — Cross-region warm-standby design

**Commit:** `<sha>` docs(infra): cross-region warm-standby design

## What

`docs/multi-region.md` — a **design document** (no infra code) for the
multi-region target: today's posture, RPO/RTO tiers, the recommended
cross-region warm-standby architecture, a 12-month migration path, and
five engineering-review decision gates. The Terraform/Helm
implementation is the follow-up PR after this design is approved.

## Grounding (verified against the repo, not invented)

- **Region:** `var.aws_region = us-east-1` (both env tfvars).
- **DB:** RDS Postgres 16, `storage_encrypted` under KMS `var.kms_key_arn`,
  `db_multi_az` true (prod) / false (staging), backup 1–35d + PITR.
- **Redis:** ElastiCache 7, cluster-mode-disabled replication group,
  `multi_az_enabled` with replicas.
- **S3:** versioning + **SSE-S3 (AES256)** — *not* KMS (module comment is
  explicit); lifecycle → IA at 90d.
- **Restore-test:** monthly, self-hosted in-VPC runner, same region.

## Key correction / reconciliation

`docs/slos.md` **already** commits SLO 6 (RPO ≤1h) + SLO 7 (RTO ≤4h) and
line 341 names cross-region as the mitigation. The brief's "same-region
HA ≤60s/≤5min" would *appear* to contradict that — so the doc frames it
honestly: ≤60s/≤5min is **Multi-AZ failover** (AZ-level), while the
committed 1h/4h SLO is **full recovery** (regional outage → restore).
Both are true for different failure modes. The doc extends SLO 6/7, not
overrides them.

## Three "key" stories kept distinct (the subtle part)

The brief's "KMS" section conflates three things; the doc separates them:
1. **AWS KMS CMK** (RDS storage, Secrets Manager) → KMS Multi-Region Key.
2. **S3 SSE-S3 (AES256)** → AWS-managed, already region-local, no action.
3. **App-layer master KEK** (`DATA_ENCRYPTION_KEY`, Epic B) wrapping the
   per-tenant DEK on `Tenant.encryptedDek` → the *secret value* must
   exist in both regions' secret stores, and the
   `DATA_ENCRYPTION_KEY_PREVIOUS` rotation must stay in lockstep across
   regions or a mid-rotation failover can't decrypt. (Same constraint
   applies to `AUTH_SECRET` for cross-region session validity.)

## Open-question recommendations (carried into the PR description)

1. Standby region → **us-west-2** (blast-radius separation, full service
   availability, canonical DR pair).
2. Tier gate → **ENTERPRISE only** (matches cost; entitlement gate exists).
3. Failover policy → **manual for year one** (auto-failover decision
   logic is a non-trivial surface; rehearsed human promote is safer).
4. Data residency → **opt-in per-tenant** (some enterprises require
   in-region-only; warm-standby must not replicate their data by default).
5. Restore-test → **add a parallel cross-region test** (standby runner +
   cross-account IAM); keep the in-region monthly test.

## Files
`docs/multi-region.md` (new) · `docs/slos.md`, `docs/infrastructure.md`,
`docs/incident-response.md` (one-line cross-links) ·
`tests/guardrails/multi-region-design-coverage.test.ts` (5/5: exists,
4 phases, 3 tiers, 5 open questions, terraform + Epic B + Epic C.3
cross-refs).
