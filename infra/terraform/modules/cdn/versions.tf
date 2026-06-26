terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
      # CloudFront ACM certificates MUST live in us-east-1 regardless of
      # the origin's region, so the caller passes a second, us-east-1
      # provider as `aws.us_east_1`. The default `aws` provider is used
      # for Route53 (global) records.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
