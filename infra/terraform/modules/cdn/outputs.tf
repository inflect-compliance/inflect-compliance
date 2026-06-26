output "cloudfront_distribution_id" {
  description = "Distribution ID — consumed by the release workflow's cache-invalidation step."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain (dXXXX.cloudfront.net) — the alias target."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_arn" {
  description = "Distribution ARN."
  value       = aws_cloudfront_distribution.this.arn
}
