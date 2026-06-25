# database module

Primary PostgreSQL store (RDS) — subnet group, security group,
parameter group (RLS backstop + `force_ssl` + pg_stat_statements),
encrypted instance with PITR, and an **optional cross-region DR
snapshot copy**.

## Cross-region DR snapshot copy (`dr_region`)

Daily copy of each automated snapshot into a second region, restorable
manually (RPO 24h / RTO ~4h). See [`docs/disaster-recovery.md`](../../../../docs/disaster-recovery.md).

Disabled by default (`dr_region = ""`). To enable:

```hcl
module "database" {
  source = "./modules/database"

  # REQUIRED when dr_region is set — the module creates DR-region
  # resources (the retention sweeper + its schedule) via aws.dr.
  providers = {
    aws    = aws
    aws.dr = aws.dr
  }

  # ... existing inputs ...

  dr_region                  = "us-west-2"
  dr_kms_key_arn             = "<multi-region CMK replica ARN in us-west-2>"
  dr_snapshot_retention_days = 35
}
```

The caller MUST declare the aliased provider:

```hcl
provider "aws" {
  alias  = "dr"
  region = var.db_dr_region != "" ? var.db_dr_region : var.aws_region
}
```

(The fallback region keeps the provider valid when DR is disabled — no
DR resources are created in that case, as they are `count`-gated.)

`dr_kms_key_arn` must be a **multi-region** CMK replica in the DR region
(encrypted cross-region snapshot copy requires a key in the
destination). See the path-(b) rationale in the implementation note.

### Outputs for the restore runbook

- `dr_region` — the DR region (empty when disabled).
- `dr_snapshot_arn_pattern` — glob for finding DR-copied snapshots.
