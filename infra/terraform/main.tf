# Root composition for the inflect-compliance infrastructure stack.
#
# Locals, tag strategy, and module wiring. Resource creation lives
# inside child modules — adding one means adding (or uncommenting) a
# `module "<name>"` block here, NOT inlining resources.

locals {
  name_prefix = "${var.project}-${var.environment}"

  base_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = "h0mele55/inflect-compliance"
    Owner       = var.owner
    CostCenter  = var.cost_center
  }

  common_tags = merge(local.base_tags, var.additional_tags)
}

# ── Networking ───────────────────────────────────────────────────────
module "vpc" {
  source = "./modules/vpc"

  name_prefix = local.name_prefix
  environment = var.environment

  cidr_block               = var.vpc_cidr_block
  az_count                 = var.vpc_az_count
  enable_nat_gateway       = true
  single_nat_gateway       = var.vpc_single_nat_gateway
  app_ingress_port         = var.app_ingress_port
  enable_flow_logs         = var.vpc_enable_flow_logs
  flow_logs_retention_days = var.vpc_flow_logs_retention_days

  tags = local.common_tags
}

# ── Database ─────────────────────────────────────────────────────────
module "database" {
  source = "./modules/database"

  # The DR snapshot-copy retention sweeper + its schedule are created in
  # the DR region via this aliased provider (count-gated on db_dr_region).
  providers = {
    aws    = aws
    aws.dr = aws.dr
  }

  name_prefix = local.name_prefix
  environment = var.environment

  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_db_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id

  engine_version           = var.db_engine_version
  instance_class           = var.db_instance_class
  allocated_storage_gb     = var.db_allocated_storage_gb
  max_allocated_storage_gb = var.db_max_allocated_storage_gb
  multi_az                 = var.db_multi_az
  deletion_protection      = var.db_deletion_protection
  skip_final_snapshot      = var.db_skip_final_snapshot
  backup_retention_days    = var.db_backup_retention_days

  # Cross-region DR snapshot copy (no-op until db_dr_region is set).
  dr_region                  = var.db_dr_region
  dr_snapshot_retention_days = var.db_dr_snapshot_retention_days
  dr_kms_key_arn             = var.db_dr_kms_key_arn

  tags = local.common_tags
}

# ── Redis ────────────────────────────────────────────────────────────
module "redis" {
  source = "./modules/redis"

  name_prefix = local.name_prefix
  environment = var.environment

  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_app_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id

  engine_version          = var.redis_engine_version
  node_type               = var.redis_node_type
  replicas_per_node_group = var.redis_replicas_per_node_group
  snapshot_retention_days = var.redis_snapshot_retention_days

  tags = local.common_tags
}

# ── Object storage ───────────────────────────────────────────────────
module "storage" {
  source = "./modules/storage"

  name_prefix = local.name_prefix
  environment = var.environment

  bucket_name        = var.storage_bucket_name
  ia_transition_days = var.storage_ia_transition_days

  cors_allowed_origins = var.storage_cors_allowed_origins

  force_destroy = var.storage_force_destroy

  tags = local.common_tags
}

# ── Runtime secrets ──────────────────────────────────────────────────
# Aggregates all runtime credentials — generated (DATA_ENCRYPTION_KEY,
# auth/jwt/AV-webhook signing keys), operator-supplied (OAuth), and
# chained (RDS-managed master creds, Redis AUTH token) — into one
# IAM policy attachable to the app workload role.
module "secrets" {
  source = "./modules/secrets"

  name_prefix = local.name_prefix
  environment = var.environment

  additional_secret_arns = [
    module.database.secret_arn,
    module.redis.auth_secret_arn,
  ]

  tags = local.common_tags
}

# ── CDN (CloudFront edge tier) ───────────────────────────────────────
# Optional global edge cache in front of the app's HTTPS endpoint
# (Caddy / Helm ingress). Caches /_next/static/* + /_next/image*; passes
# HTML + /api/* through. Disabled by default — enable per-environment
# with cdn_enabled = true. See docs/cdn.md.
module "cdn" {
  source = "./modules/cdn"
  count  = var.cdn_enabled ? 1 : 0

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix = local.name_prefix
  environment = var.environment

  domain_name        = var.cdn_domain_name
  origin_domain_name = var.cdn_origin_domain_name
  hosted_zone_id     = var.cdn_hosted_zone_id
  price_class        = var.cdn_price_class
}
