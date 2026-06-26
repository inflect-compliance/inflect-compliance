# Database module — primary PostgreSQL store.
#
# Provisions:
#   - aws_db_subnet_group across the private-db subnet tier
#   - aws_security_group "db" with ingress ONLY from app_security_group_id
#   - aws_db_parameter_group on the postgres16 family with:
#       row_security = 1            (closest cluster-level mapping to the
#                                    OI-1 "rls_force = on" requirement;
#                                    the FORCE-RLS *enforcement* is per-
#                                    table in prisma/rls-setup.sql)
#       rds.force_ssl = 1           (TLS-or-reject)
#       log_connections / log_disconnections / log_statement = ddl
#       log_min_duration_statement  (slow-query log)
#       shared_preload_libraries = pg_stat_statements
#       pg_stat_statements.track = ALL
#   - aws_db_instance:
#       engine = postgres 16, gp3 storage_encrypted = true,
#       multi_az = var.multi_az, backup_retention_period = 7,
#       PITR (implicit while retention > 0), deletion_protection,
#       Performance Insights, CloudWatch logs export,
#       publicly_accessible = false (HARDCODED — never tunable),
#       manage_master_user_password = true (RDS auto-generates the
#       password and writes it to AWS Secrets Manager — no plaintext
#       password ever lands in tfvars or terraform state).

# ── Subnet group (private-db tier) ───────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Private DB subnets for ${var.name_prefix}"
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-subnet-group"
  })
}

# ── Security group ───────────────────────────────────────────────────
# DB SG owns its own ingress contract — created by this module so the
# VPC module doesn't need to know which apps will reach the DB. The
# only ingress allowed is from the app SG passed in by the caller.
resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db-sg"
  description = "RDS Postgres — ingress from app SG only"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "Postgres from app tier"
  from_port                    = var.port
  to_port                      = var.port
  ip_protocol                  = "tcp"
  referenced_security_group_id = var.app_security_group_id
}

# ── Parameter group ──────────────────────────────────────────────────
# Family is hardcoded to postgres16 — engine_version validation
# enforces the major-version match.
resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.name_prefix}-pg16-"
  family      = "postgres16"
  description = "Postgres 16 parameter group for ${var.name_prefix}"

  # ── RLS enforcement ──
  # row_security cannot be set to 0 by any session under this parameter
  # group. The application's per-tenant policies + per-table FORCE ROW
  # LEVEL SECURITY (prisma/rls-setup.sql) handle the actual isolation;
  # this parameter is the cluster-wide backstop that prevents an
  # operator from globally disabling RLS via SET row_security=off.
  parameter {
    name  = "row_security"
    value = "1"
  }

  # ── Transport security ──
  parameter {
    name         = "rds.force_ssl"
    value        = var.force_ssl ? "1" : "0"
    apply_method = "pending-reboot"
  }

  # ── Logging / observability ──
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = tostring(var.log_min_duration_statement_ms)
  }

  # ── pg_stat_statements ──
  # shared_preload_libraries requires a reboot. Setting it via
  # apply_method = pending-reboot lets terraform converge cleanly;
  # operator triggers the reboot during the next maintenance window.
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "pg_stat_statements.track"
    value        = "ALL"
    apply_method = "pending-reboot"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# ── DB instance ──────────────────────────────────────────────────────
resource "aws_db_instance" "this" {
  identifier = "${var.name_prefix}-db"

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  # Storage
  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb > 0 ? var.max_allocated_storage_gb : null
  storage_type          = var.storage_type
  storage_encrypted     = true # HARDCODED — never tunable
  kms_key_id            = var.kms_key_arn

  # Database identity
  db_name  = var.db_name
  username = var.master_username
  port     = var.port

  # Master password — managed by RDS in AWS Secrets Manager.
  # No plaintext password ever lands in tfvars or terraform state.
  manage_master_user_password = true

  # Networking — private placement enforced
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false # HARDCODED — never tunable

  # Parameter group
  parameter_group_name = aws_db_parameter_group.this.name

  # Backup & PITR (PITR is implicit while backup_retention_period > 0)
  backup_retention_period = var.backup_retention_days
  backup_window           = var.backup_window
  copy_tags_to_snapshot   = true

  # Maintenance
  maintenance_window         = var.maintenance_window
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  apply_immediately          = var.apply_immediately

  # HA + protection
  multi_az                  = var.multi_az
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-db-final-${formatdate("YYYYMMDDHHmmss", timestamp())}"

  # Observability
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_enabled ? var.performance_insights_retention_days : null
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db"
  })

  lifecycle {
    # `final_snapshot_identifier` references timestamp() which changes
    # every plan; ignore drift on it so plans aren't perpetually dirty.
    # The identifier is only consulted at destroy-time anyway.
    ignore_changes = [final_snapshot_identifier]
  }
}

# ═══════════════════════════════════════════════════════════════════
#  Cross-region DR snapshot copy  (infra(dr) — minimum-viable DR)
# ═══════════════════════════════════════════════════════════════════
# Daily copy of each automated snapshot into a second region, restorable
# manually (RPO 24h / RTO ~4h — see docs/disaster-recovery.md). Every
# resource is count-gated on var.dr_region, so this is a no-op until a
# DR region is configured. The default `aws` provider acts in the source
# region (EventBridge rule + copy Lambda); `aws.dr` (passed by the
# caller) acts in the DR region (the retention sweeper + its schedule
# live there, next to the snapshots they prune).
#
# Prerequisite: var.dr_kms_key_arn must be a MULTI-REGION CMK replica in
# the DR region — encrypted cross-region snapshot copy needs a key in
# the destination. The current posture uses a single-region key, so a
# second multi-region CMK is created out-of-band (path b) and passed in;
# see docs/implementation-notes for the rationale.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
      # Caller MUST pass providers = { aws = aws, aws.dr = aws.dr }.
      configuration_aliases = [aws.dr]
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4, < 3.0"
    }
  }
}

locals {
  dr_enabled = var.dr_region != "" ? 1 : 0
  # Source CMK ARN as a (possibly empty) list element for IAM grants.
  source_kms_arns = var.kms_key_arn == null ? [] : [var.kms_key_arn]
}

# Source region — stamped into the copy Lambda so it knows where to copy FROM.
data "aws_region" "current" {}

# ── EventBridge rule (source region): each automated snapshot creation ──
resource "aws_cloudwatch_event_rule" "rds_snapshot_completed" {
  count       = local.dr_enabled
  name        = "${var.name_prefix}-rds-snapshot-completed"
  description = "Fire the cross-region DR copy Lambda when an automated RDS snapshot is created."

  event_pattern = jsonencode({
    source        = ["aws.rds"]
    "detail-type" = ["RDS DB Snapshot Event"]
    detail = {
      EventCategories = ["creation"]
      SourceArn       = [aws_db_instance.this.arn]
      Message         = ["Automated snapshot created"]
    }
  })

  tags = var.tags
}

# ── Copy Lambda (source region) ──
data "archive_file" "dr_snapshot_copy" {
  count       = local.dr_enabled
  type        = "zip"
  source_file = "${path.module}/lambdas/dr_snapshot_copy.py"
  output_path = "${path.module}/lambdas/.dist/dr_snapshot_copy.zip"
}

resource "aws_iam_role" "dr_snapshot_copy" {
  count = local.dr_enabled
  name  = "${var.name_prefix}-dr-snapshot-copy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

data "aws_iam_policy_document" "dr_snapshot_copy" {
  count = local.dr_enabled

  statement {
    sid       = "CopySnapshot"
    effect    = "Allow"
    actions   = ["rds:CopyDBSnapshot", "rds:DescribeDBSnapshots", "rds:AddTagsToResource", "rds:ModifyDBSnapshotAttribute"]
    resources = ["*"]
  }

  statement {
    sid       = "KmsGrants"
    effect    = "Allow"
    actions   = ["kms:CreateGrant", "kms:DescribeKey", "kms:Decrypt", "kms:GenerateDataKeyWithoutPlaintext"]
    resources = concat(local.source_kms_arns, [var.dr_kms_key_arn])
  }

  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "dr_snapshot_copy" {
  count  = local.dr_enabled
  name   = "${var.name_prefix}-dr-snapshot-copy"
  role   = aws_iam_role.dr_snapshot_copy[0].id
  policy = data.aws_iam_policy_document.dr_snapshot_copy[0].json
}

resource "aws_cloudwatch_log_group" "dr_snapshot_copy" {
  count             = local.dr_enabled
  name              = "/aws/lambda/${var.name_prefix}-dr-snapshot-copy"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_lambda_function" "dr_snapshot_copy" {
  count            = local.dr_enabled
  function_name    = "${var.name_prefix}-dr-snapshot-copy"
  description      = "Copies each automated RDS snapshot to ${var.dr_region}, re-encrypted with the DR CMK."
  role             = aws_iam_role.dr_snapshot_copy[0].arn
  runtime          = "python3.12"
  handler          = "dr_snapshot_copy.handler"
  filename         = data.archive_file.dr_snapshot_copy[0].output_path
  source_code_hash = data.archive_file.dr_snapshot_copy[0].output_base64sha256
  timeout          = 60

  environment {
    variables = {
      DR_REGION      = var.dr_region
      SOURCE_REGION  = data.aws_region.current.name
      DR_KMS_KEY_ARN = var.dr_kms_key_arn
      RETENTION_DAYS = tostring(var.dr_snapshot_retention_days)
    }
  }

  depends_on = [aws_cloudwatch_log_group.dr_snapshot_copy]
  tags       = var.tags
}

resource "aws_cloudwatch_event_target" "dr_snapshot_copy" {
  count     = local.dr_enabled
  rule      = aws_cloudwatch_event_rule.rds_snapshot_completed[0].name
  target_id = "dr-snapshot-copy"
  arn       = aws_lambda_function.dr_snapshot_copy[0].arn
}

resource "aws_lambda_permission" "dr_snapshot_copy_events" {
  count         = local.dr_enabled
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dr_snapshot_copy[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.rds_snapshot_completed[0].arn
}

# ── Retention sweeper Lambda (DR region, via aws.dr) ──
# Single responsibility: deletes DR copies older than the retention
# window. Lives in the DR region next to the snapshots it prunes.
data "archive_file" "dr_snapshot_retention" {
  count       = local.dr_enabled
  type        = "zip"
  source_file = "${path.module}/lambdas/dr_snapshot_retention.py"
  output_path = "${path.module}/lambdas/.dist/dr_snapshot_retention.zip"
}

resource "aws_iam_role" "dr_snapshot_retention" {
  count = local.dr_enabled
  name  = "${var.name_prefix}-dr-snapshot-retention"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

data "aws_iam_policy_document" "dr_snapshot_retention" {
  count = local.dr_enabled

  statement {
    sid       = "PruneDrSnapshots"
    effect    = "Allow"
    actions   = ["rds:DescribeDBSnapshots", "rds:ListTagsForResource", "rds:DeleteDBSnapshot"]
    resources = ["*"]
  }

  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "dr_snapshot_retention" {
  count  = local.dr_enabled
  name   = "${var.name_prefix}-dr-snapshot-retention"
  role   = aws_iam_role.dr_snapshot_retention[0].id
  policy = data.aws_iam_policy_document.dr_snapshot_retention[0].json
}

resource "aws_cloudwatch_log_group" "dr_snapshot_retention" {
  count             = local.dr_enabled
  provider          = aws.dr
  name              = "/aws/lambda/${var.name_prefix}-dr-snapshot-retention"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_lambda_function" "dr_snapshot_retention" {
  count            = local.dr_enabled
  provider         = aws.dr
  function_name    = "${var.name_prefix}-dr-snapshot-retention"
  description      = "Daily sweep: deletes DR-copied snapshots older than ${var.dr_snapshot_retention_days} days."
  role             = aws_iam_role.dr_snapshot_retention[0].arn
  runtime          = "python3.12"
  handler          = "dr_snapshot_retention.handler"
  filename         = data.archive_file.dr_snapshot_retention[0].output_path
  source_code_hash = data.archive_file.dr_snapshot_retention[0].output_base64sha256
  timeout          = 120

  environment {
    variables = {
      DR_REGION      = var.dr_region
      RETENTION_DAYS = tostring(var.dr_snapshot_retention_days)
    }
  }

  depends_on = [aws_cloudwatch_log_group.dr_snapshot_retention]
  tags       = var.tags
}

resource "aws_cloudwatch_event_rule" "dr_snapshot_retention" {
  count               = local.dr_enabled
  provider            = aws.dr
  name                = "${var.name_prefix}-dr-snapshot-retention"
  description         = "Daily trigger for the DR snapshot retention sweep."
  schedule_expression = "rate(1 day)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "dr_snapshot_retention" {
  count     = local.dr_enabled
  provider  = aws.dr
  rule      = aws_cloudwatch_event_rule.dr_snapshot_retention[0].name
  target_id = "dr-snapshot-retention"
  arn       = aws_lambda_function.dr_snapshot_retention[0].arn
}

resource "aws_lambda_permission" "dr_snapshot_retention_events" {
  count         = local.dr_enabled
  provider      = aws.dr
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dr_snapshot_retention[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.dr_snapshot_retention[0].arn
}

# ── Read replica (analytical / dashboard reads) ───────────────────────
# A same-region read replica for dashboard + reporting aggregation reads.
# Unlike the Multi-AZ standby (failover-only, invisible to clients), a
# read replica is independently queryable. Gated by enable_read_replica;
# off by default. The app routes eligible reads here via prismaRead +
# runInTenantReadContext — see docs/database-routing.md.
resource "aws_db_instance" "read_replica" {
  count = var.enable_read_replica ? 1 : 0

  identifier          = "${var.name_prefix}-db-ro"
  replicate_source_db = aws_db_instance.this.identifier
  instance_class      = var.read_replica_instance_class != "" ? var.read_replica_instance_class : var.instance_class

  # Same-region replica inherits the source's storage encryption, KMS
  # key, db_name, credentials, subnet group, and parameter group — none
  # are set here (RDS rejects them on a replica).
  publicly_accessible    = false # HARDCODED — never tunable
  vpc_security_group_ids = [aws_security_group.db.id]

  # Vanilla RDS read replicas inherit backups from the source; set to 0
  # on the replica to avoid double-billing snapshots.
  backup_retention_period = 0
  skip_final_snapshot     = true

  auto_minor_version_upgrade            = var.auto_minor_version_upgrade
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_enabled ? var.performance_insights_retention_days : null
  enabled_cloudwatch_logs_exports       = ["postgresql"]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-ro"
    Role = "read-replica"
  })
}
