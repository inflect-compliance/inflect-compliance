variable "environment" {
  description = "Deployment environment. Must match the backend-config file used at terraform init."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be one of: staging, production."
  }
}

variable "aws_region" {
  description = "AWS region for all regional resources in this stack."
  type        = string
}

variable "project" {
  description = "Project identifier used as the name prefix for tagged resources."
  type        = string
  default     = "inflect-compliance"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.project))
    error_message = "project must be lowercase kebab-case, 3–32 chars, starting with a letter."
  }
}

variable "owner" {
  description = "Team or individual accountable for this environment. Surfaced in tags."
  type        = string
  default     = "platform"
}

variable "cost_center" {
  description = "Cost center / billing tag value."
  type        = string
  default     = "engineering"
}

variable "additional_tags" {
  description = "Extra tags merged on top of the common tag set. Useful for ad-hoc labelling."
  type        = map(string)
  default     = {}
}

# ── VPC inputs ───────────────────────────────────────────────────────
variable "vpc_cidr_block" {
  description = "Primary IPv4 CIDR for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_az_count" {
  description = "Number of AZs to span. 2 minimum (RDS multi-AZ requirement); 3 recommended for production."
  type        = number
  default     = 3
}

variable "vpc_single_nat_gateway" {
  description = "If true, share one NAT gateway across all private subnets (cost-saver). False = per-AZ NAT for HA."
  type        = bool
  default     = false
}

variable "vpc_enable_flow_logs" {
  description = "If true, ship VPC flow logs to CloudWatch."
  type        = bool
  default     = true
}

variable "vpc_flow_logs_retention_days" {
  description = "VPC flow log retention in days."
  type        = number
  default     = 30
}

variable "app_ingress_port" {
  description = "Port the app process listens on. ALB → app SG ingress is opened on this port only."
  type        = number
  default     = 3000
}

# ── Database inputs ──────────────────────────────────────────────────
variable "db_engine_version" {
  description = "Postgres engine version. Must be 16.x (parameter-group family is hardcoded to postgres16)."
  type        = string
  default     = "16.4"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage_gb" {
  description = "Initial DB storage in GB."
  type        = number
  default     = 50
}

variable "db_max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling in GB. 0 disables autoscaling."
  type        = number
  default     = 500
}

variable "db_multi_az" {
  description = "If true, deploy RDS multi-AZ. Production = true; staging may be false to save cost."
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "If true, RDS instance cannot be deleted."
  type        = bool
  default     = true
}

variable "db_skip_final_snapshot" {
  description = "If true, no final snapshot taken on destroy. Set to true only in staging."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Days of automated backup retention. PITR is implicit while > 0. OI-1 spec = 7."
  type        = number
  default     = 7
}

# ── Cross-region DR snapshot copy (infra(dr)) ────────────────────────
variable "db_dr_region" {
  description = "AWS region for cross-region RDS snapshot copies. Empty string disables DR copies. See docs/disaster-recovery.md for the region-choice trade-offs."
  type        = string
  default     = ""
}

variable "db_dr_snapshot_retention_days" {
  description = "Days to retain copied snapshots in the DR region."
  type        = number
  default     = 35
}

variable "db_dr_kms_key_arn" {
  description = "Multi-region KMS key ARN (DR-region replica) for snapshot re-encryption on copy. REQUIRED when db_dr_region is set (path-b CMK — see docs/disaster-recovery.md)."
  type        = string
  default     = ""
}

# ── Redis inputs ─────────────────────────────────────────────────────
variable "redis_engine_version" {
  description = "Redis engine version. Must be 7.x (parameter-group family is hardcoded redis7)."
  type        = string
  default     = "7.1"
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t4g.small"
}

variable "redis_replicas_per_node_group" {
  description = "Read replicas per node group. 0 = single-node (staging); >= 1 = HA (production)."
  type        = number
  default     = 0
}

variable "redis_snapshot_retention_days" {
  description = "Days to retain automatic snapshots."
  type        = number
  default     = 1
}

# ── Storage inputs ───────────────────────────────────────────────────
variable "storage_bucket_name" {
  description = "Override S3 bucket name. Empty = derive as <name_prefix>-storage."
  type        = string
  default     = ""
}

variable "storage_ia_transition_days" {
  description = "Days after which storage objects transition to STANDARD_IA. OI-1 spec = 90."
  type        = number
  default     = 90
}

variable "storage_cors_allowed_origins" {
  description = "Origins permitted to upload via pre-signed URLs (PUT/POST). Use the app's web origin(s). Empty = no CORS rule."
  type        = list(string)
  default     = []
}

variable "storage_force_destroy" {
  description = "If true, allow `terraform destroy` to remove non-empty buckets. Production MUST leave false."
  type        = bool
  default     = false
}
