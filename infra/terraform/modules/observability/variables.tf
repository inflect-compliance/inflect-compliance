variable "name_prefix" {
  description = "Prefix for resources (Secrets Manager secret name, access-policy name)."
  type        = string
}

variable "environment" {
  description = "Deployment environment (staging / production)."
  type        = string
}

variable "stack_name" {
  description = "Display name of the Grafana Cloud stack."
  type        = string
}

variable "stack_slug" {
  description = "Globally-unique Grafana Cloud stack slug (lowercase, becomes the <slug>.grafana.net subdomain)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,}$", var.stack_slug))
    error_message = "stack_slug must be lowercase alphanumeric, start with a letter, and be at least 3 chars (it is the grafana.net subdomain)."
  }
}

variable "stack_region" {
  description = "Grafana Cloud region slug for the stack + access policy (e.g. us, eu, au, prod-us-east-0). Must match the customer's data-residency requirement."
  type        = string
  default     = "us"
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key ARN encrypting the OTLP-auth secret. Null = AWS-managed Secrets Manager key. Pass the same key used by the secrets/ module."
  type        = string
  default     = null
}

variable "secret_recovery_days" {
  description = "Secrets Manager recovery window for the OTLP-auth secret (7–30). 0 forces immediate deletion (disallowed)."
  type        = number
  default     = 7

  validation {
    condition     = var.secret_recovery_days >= 7 && var.secret_recovery_days <= 30
    error_message = "secret_recovery_days must be 7–30 (AWS Secrets Manager limits)."
  }
}

variable "write_to_secrets_manager" {
  description = "If true, persist the OTLP Basic-auth token to AWS Secrets Manager. Set false when the token is injected by other means (e.g. a k8s External Secrets operator pointed elsewhere)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to created AWS resources and propagated to the Grafana Cloud stack labels."
  type        = map(string)
  default     = {}
}
