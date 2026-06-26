output "environment" {
  description = "Resolved environment name for this stack."
  value       = var.environment
}

output "aws_region" {
  description = "AWS region targeted by this stack."
  value       = var.aws_region
}

output "name_prefix" {
  description = "Standard name prefix for resources created in this stack."
  value       = local.name_prefix
}

output "common_tags" {
  description = "Tag map applied via the AWS provider's default_tags."
  value       = local.common_tags
}

# ── VPC outputs ──────────────────────────────────────────────────────
output "vpc_id" {
  description = "VPC ID."
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block."
  value       = module.vpc.vpc_cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB tier)."
  value       = module.vpc.public_subnet_ids
}

output "private_app_subnet_ids" {
  description = "Private app subnet IDs."
  value       = module.vpc.private_app_subnet_ids
}

output "private_db_subnet_ids" {
  description = "Private DB subnet IDs."
  value       = module.vpc.private_db_subnet_ids
}

output "alb_security_group_id" {
  description = "ALB security group ID."
  value       = module.vpc.alb_security_group_id
}

output "app_security_group_id" {
  description = "App tier security group ID."
  value       = module.vpc.app_security_group_id
}

# ── Database outputs ─────────────────────────────────────────────────
output "db_endpoint" {
  description = "Database connection endpoint (host:port)."
  value       = module.database.endpoint
}

output "db_address" {
  description = "Database hostname only (no port)."
  value       = module.database.address
}

output "db_port" {
  description = "Database port."
  value       = module.database.port
}

output "db_name" {
  description = "Initial database name."
  value       = module.database.db_name
}

output "db_security_group_id" {
  description = "Database security group ID."
  value       = module.database.security_group_id
}

output "db_secret_arn" {
  description = "ARN of the AWS Secrets Manager secret holding RDS master credentials. App reads this at runtime via the AWS SDK."
  value       = module.database.secret_arn
  sensitive   = true
}

# ── Redis outputs ────────────────────────────────────────────────────
output "redis_primary_endpoint" {
  description = "Redis primary endpoint hostname. Use rediss:// scheme — TLS in transit is on."
  value       = module.redis.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint hostname. Null when running single-node (staging)."
  value       = module.redis.reader_endpoint_address
}

output "redis_port" {
  description = "Redis port."
  value       = module.redis.port
}

output "redis_security_group_id" {
  description = "Redis security group ID."
  value       = module.redis.security_group_id
}

output "redis_auth_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the Redis AUTH token."
  value       = module.redis.auth_secret_arn
  sensitive   = true
}

# ── Storage outputs ──────────────────────────────────────────────────
output "storage_bucket_id" {
  description = "S3 bucket name for app object storage."
  value       = module.storage.bucket_id
}

output "storage_bucket_arn" {
  description = "S3 bucket ARN."
  value       = module.storage.bucket_arn
}

output "storage_bucket_regional_domain_name" {
  description = "Region-pinned bucket domain name. Use this for app config (S3_ENDPOINT)."
  value       = module.storage.bucket_regional_domain_name
}

output "storage_access_policy_arn" {
  description = "IAM policy granting the app workload its storage access surface. Attach to whatever workload role consumes it."
  value       = module.storage.access_policy_arn
}

# ── Runtime secrets ──────────────────────────────────────────────────
output "runtime_secret_names" {
  description = "Map of app env-var name → AWS Secrets Manager secret name. Consumed by scripts/bootstrap-env-from-secrets.sh and (later) ECS task-definition `secrets:` mappings."
  value       = module.secrets.secret_names
}

output "runtime_secret_arns" {
  description = "Map of logical name → secret ARN for OI-1-managed runtime secrets."
  value       = module.secrets.secret_arns
}

output "runtime_secrets_read_policy_arn" {
  description = "IAM policy granting GetSecretValue + DescribeSecret on every runtime secret (module-internal + DB + Redis). Attach to the app workload role."
  value       = module.secrets.runtime_secrets_read_policy_arn
}

output "all_runtime_secret_arns" {
  description = "Full list of secret ARNs covered by the runtime-secrets-read policy. Useful for auditing the workload role's blast radius."
  value       = module.secrets.all_runtime_secret_arns
}

output "cdn_distribution_id" {
  description = "CloudFront distribution ID (empty when cdn_enabled = false)."
  value       = var.cdn_enabled ? module.cdn[0].cloudfront_distribution_id : ""
}

output "cdn_domain_name" {
  description = "CloudFront distribution domain (empty when cdn_enabled = false)."
  value       = var.cdn_enabled ? module.cdn[0].cloudfront_domain_name : ""
}
