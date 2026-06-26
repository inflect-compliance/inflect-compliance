variable "name_prefix" {
  description = "Resource name prefix (e.g. inflect-production)."
  type        = string
}

variable "environment" {
  description = "Deployment environment (staging | production)."
  type        = string
}

variable "domain_name" {
  description = <<-EOT
    Public CDN-facing domain — gets the Route53 alias + the ACM cert
    (e.g. app.inflect.app). MUST differ from origin_domain_name, or
    CloudFront loops back on itself.
  EOT
  type        = string
}

variable "origin_domain_name" {
  description = <<-EOT
    Origin hostname CloudFront pulls from — the existing Caddy / Helm
    ingress HTTPS endpoint (e.g. origin.inflect.app). Not loop-safe if
    equal to domain_name.
  EOT
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for the alias record + ACM DNS validation."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 = US/CA/EU edges (cheapest); PriceClass_All = every edge."
  type        = string
  default     = "PriceClass_100"
}

variable "origin_shared_secret" {
  description = <<-EOT
    Secret value sent to the origin as the X-CDN-Origin-Secret header so
    the origin (Caddy / ingress) can reject direct, non-CDN traffic. This
    is the custom-origin equivalent of S3 Origin Access Control (OAC is
    S3/Lambda-only and does not apply to a custom HTTP origin). Empty
    disables the header.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}
