output "grafana_otlp_endpoint" {
  description = "OTLP/HTTP endpoint the app's OTEL_EXPORTER_OTLP_ENDPOINT points at."
  value       = grafana_cloud_stack.this.otlp_url
}

output "grafana_otlp_basic_auth_token" {
  description = "Base64 of '<otlp_user_id>:<token>' for the OTLP HTTP Basic auth header (OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <value>). Sensitive."
  value       = local.otlp_basic_auth_token
  sensitive   = true
}

output "grafana_workspace_url" {
  description = "Grafana workspace URL operators bookmark (dashboards / explore / alerting)."
  value       = grafana_cloud_stack.this.url
}

output "prometheus_remote_write_url" {
  description = "Mimir/Prometheus remote-write endpoint, for components that push Prometheus metrics directly (bypassing the OTLP gateway)."
  value       = grafana_cloud_stack.this.prometheus_remote_write_endpoint
}

output "tempo_otlp_endpoint" {
  description = "Tempo traces endpoint, for direct trace ingestion if not routing through the OTLP gateway."
  value       = grafana_cloud_stack.this.traces_url
}

output "loki_push_url" {
  description = "Loki push endpoint, for direct log shipping if not routing through the OTLP gateway."
  value       = grafana_cloud_stack.this.logs_url
}

output "otlp_auth_secret_arn" {
  description = "ARN of the AWS Secrets Manager secret holding the OTLP Basic-auth token. Null when write_to_secrets_manager = false. Add to the secrets/ module's additional_secret_arns so the app workload role can read it."
  value       = var.write_to_secrets_manager ? aws_secretsmanager_secret.otlp_auth[0].arn : null
}

output "otlp_auth_secret_name" {
  description = "Name of the OTLP-auth Secrets Manager secret. Null when write_to_secrets_manager = false."
  value       = var.write_to_secrets_manager ? aws_secretsmanager_secret.otlp_auth[0].name : null
}

output "stack_id" {
  description = "Grafana Cloud stack id."
  value       = grafana_cloud_stack.this.id
}
