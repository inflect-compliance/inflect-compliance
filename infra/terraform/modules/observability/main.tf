# Observability module — managed Grafana Cloud stack (PATH A).
#
# The cheapest-operational-burden provisioning path for the telemetry
# the app already emits over OTLP/HTTP. One Grafana Cloud stack gives
# the full backend set behind a single vendor:
#
#   - Mimir / Prometheus  → metrics  (OTEL metrics + Prometheus remote-write)
#   - Tempo               → traces   (OTLP/HTTP)
#   - Loki                → logs     (OTLP/HTTP + Loki push)
#   - Grafana             → dashboards (the same JSON dashboards the
#                            self-hosted Helm path ships, imported by ops)
#
# The app's `OTEL_EXPORTER_OTLP_ENDPOINT` points at `otlp_url`; auth is
# HTTP Basic (`OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <token>`).
#
# Recommended for production. For air-gapped / on-prem / regulated
# deployments that cannot egress to a SaaS backend, use PATH B instead
# (infra/helm/observability — self-hosted OTel+Prom+Tempo+Grafana).
#
# Provider note (see docs/implementation-notes/2026-06-25-observability-
# provisioning.md): Grafana Cloud is the pick — single vendor, native
# OTLP, lowest ops burden. If procurement forbids it, AWS Managed
# Prometheus + AWS Managed Grafana (`aws_amp_workspace` +
# `aws_grafana_workspace`) yields the same telemetry shape at the cost
# of vendor lock-in; swap the resources below and keep the outputs.

terraform {
  required_providers {
    # Provisions the Grafana Cloud stack + scoped OTLP write token.
    grafana = {
      source  = "grafana/grafana"
      version = ">= 3.0, < 4.0"
    }
    # Persists the OTLP Basic-auth token into AWS Secrets Manager so the
    # app workload role reads it the same way it reads every other
    # runtime secret (mirrors the secrets/ module).
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }
}

# ── Grafana Cloud stack ──────────────────────────────────────────────
# One stack per environment. Bundles Loki + Tempo + Mimir + Grafana and
# exposes the OTLP endpoint the app already speaks.
resource "grafana_cloud_stack" "this" {
  name        = var.stack_name
  slug        = var.stack_slug
  region_slug = var.stack_region
  description = "Inflect Compliance observability — ${var.environment}"

  labels = merge(var.tags, {
    environment = var.environment
  })
}

# ── Scoped OTLP write credentials ────────────────────────────────────
# An access policy limited to WRITE on the three signals (no read, no
# admin) — the token only ever ships telemetry, so a leak cannot read
# data or mutate config. Realm-scoped to this stack only.
resource "grafana_cloud_access_policy" "otlp_write" {
  region       = var.stack_region
  name         = "${var.name_prefix}-otlp-write"
  display_name = "OTLP write — ${var.environment}"

  scopes = [
    "metrics:write",
    "logs:write",
    "traces:write",
  ]

  realm {
    type       = "stack"
    identifier = grafana_cloud_stack.this.id
  }
}

resource "grafana_cloud_access_policy_token" "otlp_write" {
  region           = var.stack_region
  access_policy_id = grafana_cloud_access_policy.otlp_write.policy_id
  name             = "${var.name_prefix}-otlp-write-token"
  display_name     = "OTLP write token — ${var.environment}"
}

locals {
  # Grafana Cloud's OTLP gateway authenticates with HTTP Basic, where
  # the username is the stack's numeric instance id and the password is
  # the access-policy token. The app sets:
  #   OTEL_EXPORTER_OTLP_ENDPOINT=<otlp_url>
  #   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <this base64 value>
  otlp_basic_auth_token = base64encode(
    "${grafana_cloud_stack.this.id}:${grafana_cloud_access_policy_token.otlp_write.token}"
  )
}

# ── Persist the OTLP auth token in AWS Secrets Manager ───────────────
# Same handling as the secrets/ module: the sensitive value never lands
# in tfvars; the app workload role reads it at boot. Toggle off for
# deployments that inject the token by other means.
resource "aws_secretsmanager_secret" "otlp_auth" {
  count = var.write_to_secrets_manager ? 1 : 0

  name                    = "${var.name_prefix}-grafana-otlp-auth"
  description             = "Grafana Cloud OTLP Basic-auth token (base64 of '<otlp_user_id>:<token>'). App sets OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <value>."
  recovery_window_in_days = var.secret_recovery_days
  kms_key_id              = var.kms_key_arn

  tags = merge(var.tags, {
    Sensitivity = "high"
    Purpose     = "otlp-export-auth"
  })
}

resource "aws_secretsmanager_secret_version" "otlp_auth" {
  count = var.write_to_secrets_manager ? 1 : 0

  secret_id     = aws_secretsmanager_secret.otlp_auth[0].id
  secret_string = local.otlp_basic_auth_token
}
