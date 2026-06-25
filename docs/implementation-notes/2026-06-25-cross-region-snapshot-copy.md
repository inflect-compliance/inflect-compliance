# 2026-06-25 — Cross-region RDS snapshot copy (minimum-viable DR)

**Commit:** `<pending>` infra(dr): cross-region RDS snapshot copy + restore runbook

## What this is

The smallest useful DR improvement: a daily copy of the latest automated
RDS snapshot into a second region + the runbook to restore from it.
**RPO 24h, RTO ~4h, ~$20/mo.** Not warm-standby, not a read-replica, not
active-active — the bottom rung of the DR ladder (see
`docs/disaster-recovery.md`). It ships the *option*; production is
unchanged until `db_dr_region` is set.

## Design

- **Source region** (default `aws` provider): an EventBridge rule on
  automated-snapshot creation → a copy Lambda that calls
  `rds:CopyDBSnapshot` into the DR region, re-encrypting under the DR
  CMK and tagging `dr-copy=true` + `dr-retention-days`.
- **DR region** (`aws.dr` aliased provider): a daily-scheduled retention
  Lambda that deletes `dr-copy=true` snapshots older than the window.
  Co-located with the snapshots it prunes.
- Two Lambdas, **single responsibility each** — a copy bug can never
  delete; a retention bug can never block a copy. The retention sweeper
  only ever touches `dr-copy=true` snapshots, so it cannot delete an
  operator's unrelated manual snapshots.
- Everything is `count`-gated on `var.dr_region != ""` → zero resources,
  zero cost when disabled.

## Decisions

### Multi-region KMS — path (b)

Encrypted cross-region copy needs a KMS key in the destination. The
current posture is single-region. **Chose path (b)** — a *second*
multi-region CMK for the copy — over path (a) flipping the existing key
to `multi_region = true`. Path (a) **recreates** the in-use key
(re-encrypting every existing snapshot + secret); path (b) leaves the
production key untouched and re-encrypts only on copy. The DR-region
replica ARN is passed as `db_dr_kms_key_arn` (a `validation` block makes
it required whenever `dr_region` is set). The CMK itself is created
out-of-band / in a sibling PR — keeps this change non-destructive and
the KMS migration atomic if the team prefers.

### `aws.dr` provider alias (a module-interface change)

Adding `configuration_aliases = [aws.dr]` to the database module makes
every caller pass `providers = { aws = aws, aws.dr = aws.dr }`. The root
composition now declares a second `provider "aws" { alias = "dr" }` whose
region falls back to the primary when DR is disabled (a provider block
must have a non-empty region; no DR resources are created in that case).
Documented in the module README.

### 24h RPO is the honest number

PITR is ~5 min *within* the source region but irrelevant once that region
is gone — then the recovery point is the last copied snapshot (≤24h). The
PR description + `docs/disaster-recovery.md` state this plainly rather
than implying better.

### The restore test is the real validation

A snapshot copy that's never restored is theatre. `restore-test.sh`
gained `--region` + `--snapshot-type` (DR copies are *manual*
snapshots); `restore-test.yml` gained a **quarterly** cross-region job
(separate cron from the monthly same-region one — a cross-region restore
is too expensive monthly). The manual smoke (apply → wait for the next
automated snapshot → confirm it appears in the DR region) proves wiring;
the quarterly restore proves recoverability.

## Risk surface

- The copy Lambda's role grants `rds:CopyDBSnapshot` + `kms:CreateGrant`
  on the source + DR keys — a misconfigured grant is a cross-region
  exfil path. Reviewed: actions are copy/describe/tag + KMS grant/decrypt
  only; KMS resources are the two specific key ARNs, not `*`.
- Cost scales with DB size (~$0.02/GB/day cross-region transfer).
- The multi-region CMK is a one-way migration — once created you can't
  collapse to single-region without re-encrypting everything.

## Open operational questions (block raising SLA above RTO 4h)

Which region is DR (data-residency, not just latency); who holds
break-glass restore IAM; what RTO is actually contracted. Detailed in
`docs/disaster-recovery.md`.

## Out of scope (follow-ups)

Read-replica rung; S3 CRR for the evidence bucket; warm-standby
(`docs/multi-region.md`); automated failover (this is human-driven).

## Verification

`terraform fmt -check` + `terraform validate` clean (root, with the DR
module wired); `bash -n` on the script; the
`dr-snapshot-coverage.test.ts` ratchet. Manual smoke + quarterly restore
as above.
