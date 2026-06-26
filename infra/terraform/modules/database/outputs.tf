output "endpoint" {
  description = "Connection endpoint (host:port) for the primary DB instance."
  value       = aws_db_instance.this.endpoint
}

output "address" {
  description = "Hostname only (no port) — convenient for app config that builds the URL itself."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Database port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name created on the instance."
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master DB username. Bootstrap-only — runtime uses app_user."
  value       = aws_db_instance.this.username
}

output "instance_id" {
  description = "RDS DB instance identifier."
  value       = aws_db_instance.this.id
}

output "instance_arn" {
  description = "RDS DB instance ARN."
  value       = aws_db_instance.this.arn
}

output "security_group_id" {
  description = "Security group ID controlling ingress to the database."
  value       = aws_security_group.db.id
}

output "subnet_group_name" {
  description = "DB subnet group name."
  value       = aws_db_subnet_group.this.name
}

output "parameter_group_name" {
  description = "Parameter group name. Locks row_security = 1 (RLS-on backstop) and rds.force_ssl = 1."
  value       = aws_db_parameter_group.this.name
}

output "secret_arn" {
  description = "ARN of the AWS Secrets Manager secret holding the master credentials. RDS-managed (manage_master_user_password = true)."
  value       = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
}

output "kms_key_id" {
  description = "KMS key ID used for storage encryption."
  value       = aws_db_instance.this.kms_key_id
}

# ── Cross-region DR snapshot copy ────────────────────────────────────
output "dr_region" {
  description = "DR region snapshots are copied to. Empty string when DR copy is disabled."
  value       = var.dr_region
}

output "dr_snapshot_arn_pattern" {
  description = "ARN pattern for finding DR-copied snapshots in the DR region — used by the restore runbook + the quarterly cross-region restore test."
  value       = var.dr_region == "" ? "" : "arn:aws:rds:${var.dr_region}:*:snapshot:dr-rds-${aws_db_instance.this.identifier}-*"
}

output "read_replica_endpoint" {
  description = "Read-replica connection endpoint (null when enable_read_replica = false). Feeds the app's DATABASE_READ_URL (via PgBouncer-read)."
  value       = try(aws_db_instance.read_replica[0].endpoint, null)
}
