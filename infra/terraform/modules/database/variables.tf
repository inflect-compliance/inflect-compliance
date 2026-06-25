variable "name_prefix" {
  description = "Prefix for resources."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "vpc_id" {
  description = "VPC the database lives in."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the DB subnet group. Must span >= 2 AZs (RDS requirement, multi-AZ-ready)."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "subnet_ids must have at least 2 entries (RDS requires multi-AZ subnet group coverage)."
  }
}

variable "app_security_group_id" {
  description = "Security group of the app tier. Database ingress is opened ONLY from this SG."
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version. Pin to match prisma + app driver compat. The major version locks the parameter group family (postgres16)."
  type        = string
  default     = "16.4"

  validation {
    condition     = can(regex("^16\\.", var.engine_version))
    error_message = "engine_version must be on the Postgres 16 line — the parameter_group_family is hardcoded to postgres16."
  }
}

variable "instance_class" {
  description = "RDS instance class. Override per-env (smaller in staging)."
  type        = string
  default     = "db.t4g.medium"
}

variable "allocated_storage_gb" {
  description = "Initial allocated storage in GB. Auto-scales up to var.max_allocated_storage_gb."
  type        = number
  default     = 50
}

variable "max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling. 0 disables autoscaling. Must be > allocated_storage_gb when non-zero."
  type        = number
  default     = 500
}

variable "storage_type" {
  description = "RDS storage type. gp3 is the modern default (better IOPS/throughput per GB than gp2)."
  type        = string
  default     = "gp3"

  validation {
    condition     = contains(["gp3", "gp2", "io1", "io2"], var.storage_type)
    error_message = "storage_type must be one of: gp3, gp2, io1, io2."
  }
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key ARN for storage encryption. Null = use the AWS-managed RDS KMS key."
  type        = string
  default     = null
}

variable "db_name" {
  description = "Initial database created on the instance. App's DATABASE_URL must reference this name."
  type        = string
  default     = "inflect_compliance"
}

variable "master_username" {
  description = "Master DB username. Bootstrap-only — runtime queries use the app_user role per prisma/rls-setup.sql."
  type        = string
  default     = "postgres"
}

variable "port" {
  description = "Database port."
  type        = number
  default     = 5432
}

variable "backup_retention_days" {
  description = "Days of automated backup retention. PITR is implicit while > 0. OI-1 spec = 7 (dev/staging acceptable; prod can extend to 14+)."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be 1–35 (RDS limit). 0 disables PITR — explicitly disallowed for OI-1."
  }
}

variable "backup_window" {
  description = "UTC backup window, format hh24:mi-hh24:mi. Should be off-peak."
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "UTC maintenance window. Should not overlap backup_window."
  type        = string
  default     = "sun:04:30-sun:05:30"
}

variable "multi_az" {
  description = "If true, run in multi-AZ for HA. Production = true; staging may be false to save cost."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "If true, RDS instance cannot be deleted via API/terraform. Production = true. Override to false in staging when re-creation is expected."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "If true, no final snapshot is taken on destroy. Set to true ONLY in staging."
  type        = bool
  default     = false
}

variable "performance_insights_enabled" {
  description = "If true, enable RDS Performance Insights. Recommended for all envs."
  type        = bool
  default     = true
}

variable "performance_insights_retention_days" {
  description = "Performance Insights retention. 7 = free tier. 31, 62, 93, ..., 731 = paid."
  type        = number
  default     = 7
}

variable "auto_minor_version_upgrade" {
  description = "If true, RDS applies minor version upgrades during the maintenance window."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "If true, parameter / instance changes apply outside the maintenance window. Production should be false."
  type        = bool
  default     = false
}

variable "force_ssl" {
  description = "If true, sets rds.force_ssl = 1 in the parameter group. The app driver MUST use sslmode=require."
  type        = bool
  default     = true
}

variable "log_min_duration_statement_ms" {
  description = "Slow-query log threshold in ms. -1 disables. Default 1000ms (1s) — surface real slow paths without flooding logs."
  type        = number
  default     = 1000
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}

# ── Cross-region DR snapshot copy (infra(dr)) ────────────────────────
variable "dr_region" {
  description = "AWS region for cross-region snapshot copies. Empty string disables DR copies (all DR resources are count-gated on this)."
  type        = string
  default     = ""
}

variable "dr_snapshot_retention_days" {
  description = "How many days to retain copied snapshots in the DR region (the retention Lambda deletes older DR copies)."
  type        = number
  default     = 35

  validation {
    condition     = var.dr_snapshot_retention_days >= 1
    error_message = "dr_snapshot_retention_days must be >= 1."
  }
}

variable "dr_kms_key_arn" {
  description = "Multi-region KMS key ARN (DR-region replica) used to re-encrypt snapshots on copy. REQUIRED when dr_region is set — cross-region copy of an encrypted snapshot needs a key in the destination region (see docs/disaster-recovery.md, path-b CMK)."
  type        = string
  default     = ""

  validation {
    condition     = var.dr_region == "" || var.dr_kms_key_arn != ""
    error_message = "dr_kms_key_arn is required when dr_region is set (encrypted cross-region copy needs a DR-region CMK)."
  }
}
