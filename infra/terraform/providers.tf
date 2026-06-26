provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# DR region — consumed by the database module's cross-region snapshot
# copy (the retention sweeper + its schedule live in the DR region).
# Falls back to the primary region when DR is disabled (db_dr_region =
# ""), since a provider block must always have a non-empty region; no
# DR resources are created in that case (they are count-gated).
provider "aws" {
  alias  = "dr"
  region = var.db_dr_region != "" ? var.db_dr_region : var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# CloudFront ACM certificates must be issued in us-east-1 regardless of
# the stack's primary region. Consumed by the CDN module (modules/cdn).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
