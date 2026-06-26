# CDN module — CloudFront edge tier in front of the application's HTTPS
# endpoint (the Caddy / Helm ingress). Caches Next.js's immutable hashed
# bundles + image-optimizer output at the edge; passes HTML + /api/*
# straight through (every API response carries auth context).
#
# Scope (deliberate):
#   - Caches /_next/static/* (1y immutable) and /_next/image* (30d).
#   - Does NOT cache /api/* or the HTML shell.
#   - Does NOT front the evidence S3 bucket — that is tenant-private and
#     served via authenticated signed URLs (a separate conversation).
#   - No CloudFront Functions / Lambda@Edge — the cache surface is static.
#
# See docs/cdn.md for the full cache-behaviour matrix + rationale.

locals {
  origin_id = "${var.name_prefix}-origin"
}

# ── ACM certificate (us-east-1 — required for CloudFront) ──────────────

resource "aws_acm_certificate" "cdn" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.name_prefix}-cdn"
    Environment = var.environment
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cdn" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ── CloudFront distribution ────────────────────────────────────────────

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name_prefix} static-asset edge tier"
  price_class     = var.price_class
  aliases         = [var.domain_name]

  origin {
    domain_name = var.origin_domain_name
    origin_id   = local.origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Custom-origin equivalent of OAC: a shared secret header the origin
    # can require, so direct (CDN-bypassing) hits can be rejected.
    dynamic "custom_header" {
      for_each = toset(var.origin_shared_secret != "" ? ["enabled"] : [])
      content {
        name  = "X-CDN-Origin-Secret"
        value = var.origin_shared_secret
      }
    }
  }

  # /_next/static/* — immutable hashed bundles. Cache 1 year.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.origin_id
    compress               = true
    min_ttl                = 31536000
    default_ttl            = 31536000
    max_ttl                = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # /_next/image* — Next image-optimizer output. Cache 30 days, vary on
  # the optimizer's query params (w=, q=).
  ordered_cache_behavior {
    path_pattern           = "/_next/image*"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.origin_id
    compress               = true
    min_ttl                = 86400
    default_ttl            = 2592000
    max_ttl                = 2592000

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }
  }

  # /api/* — never cached; every response carries auth context.
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.origin_id
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Cookie", "X-Request-ID", "Host"]
      cookies {
        forward = "all"
      }
    }
  }

  # Default — the dynamic HTML shell. Never cached.
  default_cache_behavior {
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.origin_id
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = true
      cookies {
        forward = "all"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.name_prefix}-cdn"
    Environment = var.environment
  }
}

# ── DNS alias → the distribution ───────────────────────────────────────

resource "aws_route53_record" "cdn_alias" {
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
