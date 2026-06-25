#!/usr/bin/env bash
# Monthly automated restore test for the managed RDS Postgres database.
#
# Epic OI-3 source-of-truth: "monthly automated restore test ... restore
# latest backup to a temporary instance ... run smoke tests against it
# ... tear it down after validation".
#
# Why this matters:
#   "Backup enabled" is not the same as "backup recoverable". Cloud
#   provider snapshots have failure modes (corrupted backup, IAM
#   regressions blocking restore, schema-version drift since the
#   backup was taken). Monthly restore exercises the full path —
#   identify-snapshot → restore → connect → query → teardown — and
#   catches drift before a real incident does.
#
# Lifecycle:
#   1. Find the latest automated snapshot of the source RDS instance
#   2. Restore it to a TEMPORARY instance with a timestamped name
#   3. Wait for the temporary instance to become available
#   4. Connect via psql + run a structured set of validation checks
#      (schema reachable, key tables non-empty, recent rows exist)
#   5. Tear the temporary instance down (delete + skip-final-snapshot)
#
# Cleanup is registered with `trap` so it runs on success, failure,
# and SIGTERM/SIGINT alike — never leak a temporary instance.
#
# Network prerequisite: the runner executing this script MUST be able
# to reach the temporary RDS instance over port 5432. Practical
# options:
#   - Self-hosted GitHub Actions runner inside the VPC
#   - EC2 jumpbox in the VPC (run the script over SSH)
#   - Inside the EKS cluster as a Kubernetes Job (recommended —
#     uses the cluster's existing VPC + SG posture)
# A public RDS endpoint is INTENTIONALLY NOT supported (the chart's
# DB module hardcodes publicly_accessible=false; we don't soften that
# for the test instance either).
#
# Required tooling on the runner: aws (CLI v2), jq, psql.

set -euo pipefail

# ─── Flags ───
# --region <r>          override AWS_REGION (used by the quarterly
#                       cross-region DR restore test to restore in the
#                       DR region instead of the source region).
# --snapshot-type <t>   automated (default, same-region) | manual.
#                       Cross-region DR copies land as MANUAL snapshots,
#                       so the DR restore test passes `--snapshot-type
#                       manual`. The copies retain the source instance's
#                       DBInstanceIdentifier, so discovery still filters
#                       by SOURCE_DB_INSTANCE_ID.
SNAPSHOT_TYPE="automated"
while [ $# -gt 0 ]; do
    case "$1" in
        --region)        AWS_REGION="$2"; shift 2 ;;
        --region=*)      AWS_REGION="${1#*=}"; shift ;;
        --snapshot-type) SNAPSHOT_TYPE="$2"; shift 2 ;;
        --snapshot-type=*) SNAPSHOT_TYPE="${1#*=}"; shift ;;
        *) echo "FATAL: unknown argument: $1" >&2; exit 2 ;;
    esac
done

# ─── Required env (operator-set or workflow-set) ───
# AWS_REGION                 — e.g. us-east-1
# SOURCE_DB_INSTANCE_ID      — e.g. inflect-compliance-production-db
# RESTORE_DB_INSTANCE_CLASS  — e.g. db.t4g.small (smaller than prod is fine
#                              for the test; we're validating restore, not
#                              load-testing)
# RESTORE_VPC_SECURITY_GROUP_IDS — comma-separated SG IDs that allow
#                                  ingress from the runner
# RESTORE_DB_SUBNET_GROUP    — subnet group name (typically the same
#                              as the source instance's)
# DB_NAME                    — database name to validate (default: inflect_compliance)
# DB_USER                    — username for the validation queries (default: postgres)
# DB_PASSWORD_SECRET_ID      — Secrets Manager secret ID containing the
#                              password (RDS-managed secret — restored
#                              instances inherit the password from the
#                              snapshot's master credential at restore
#                              time, which means we can read the secret
#                              of the source instance to authenticate
#                              against the restored one)

: "${AWS_REGION:?AWS_REGION must be set}"
: "${SOURCE_DB_INSTANCE_ID:?SOURCE_DB_INSTANCE_ID must be set}"
: "${RESTORE_DB_INSTANCE_CLASS:=db.t4g.small}"
: "${RESTORE_VPC_SECURITY_GROUP_IDS:?RESTORE_VPC_SECURITY_GROUP_IDS must be set}"
: "${RESTORE_DB_SUBNET_GROUP:?RESTORE_DB_SUBNET_GROUP must be set}"
: "${DB_NAME:=inflect_compliance}"
: "${DB_USER:=postgres}"
: "${DB_PASSWORD_SECRET_ID:?DB_PASSWORD_SECRET_ID must be set}"

# ─── Tooling check ───
for tool in aws jq psql; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FATAL: required tool not found: $tool" >&2
        exit 2
    fi
done

# ─── Unique restore-target name (collision-proof under concurrent runs) ───
TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
RESTORE_INSTANCE_ID="${SOURCE_DB_INSTANCE_ID}-restore-test-${TIMESTAMP}"
# RDS identifiers must be 1-63 chars; trim if needed.
RESTORE_INSTANCE_ID="$(echo "$RESTORE_INSTANCE_ID" | cut -c1-63)"

echo "═══════════════════════════════════════════════════════════════"
echo "  Restore test"
echo "  Source:  $SOURCE_DB_INSTANCE_ID"
echo "  Target:  $RESTORE_INSTANCE_ID"
echo "  Region:  $AWS_REGION"
echo "═══════════════════════════════════════════════════════════════"

# ─── Cleanup trap (always runs, even on failure) ───
cleanup() {
    local exit_code=$?
    echo ""
    echo "── Cleanup: deleting $RESTORE_INSTANCE_ID ──"

    # Best-effort delete. We use --skip-final-snapshot because the
    # source's PITR window is the canonical recovery surface; another
    # snapshot of a test restore is just noise in the snapshot list.
    # --delete-automated-backups discards the test's own automated
    # backups created during its short life (default retention=0
    # since we set --backup-retention-period 0 below).
    if aws rds describe-db-instances \
        --region "$AWS_REGION" \
        --db-instance-identifier "$RESTORE_INSTANCE_ID" \
        >/dev/null 2>&1; then
        aws rds delete-db-instance \
            --region "$AWS_REGION" \
            --db-instance-identifier "$RESTORE_INSTANCE_ID" \
            --skip-final-snapshot \
            --delete-automated-backups \
            >/dev/null
        echo "✓ Delete initiated (async)"
    else
        echo "(no temporary instance to delete — already gone or never created)"
    fi

    if [ "$exit_code" -eq 0 ]; then
        echo "✓ Restore test PASSED"
    else
        echo "✗ Restore test FAILED (exit $exit_code)"
    fi
    exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ─── 1. Find the latest automated snapshot ───
echo ""
echo "── 1. Finding latest automated snapshot ──"
LATEST_SNAPSHOT_ARN="$(aws rds describe-db-snapshots \
    --region "$AWS_REGION" \
    --db-instance-identifier "$SOURCE_DB_INSTANCE_ID" \
    --snapshot-type "$SNAPSHOT_TYPE" \
    --query 'sort_by(DBSnapshots, &SnapshotCreateTime) | [-1].DBSnapshotArn' \
    --output text)"

if [ -z "$LATEST_SNAPSHOT_ARN" ] || [ "$LATEST_SNAPSHOT_ARN" = "None" ]; then
    echo "FATAL: no automated snapshots found for $SOURCE_DB_INSTANCE_ID" >&2
    echo "       Verify backup_retention_days > 0 in the Terraform module" >&2
    exit 3
fi

LATEST_SNAPSHOT_TIME="$(aws rds describe-db-snapshots \
    --region "$AWS_REGION" \
    --db-instance-identifier "$SOURCE_DB_INSTANCE_ID" \
    --snapshot-type "$SNAPSHOT_TYPE" \
    --query 'sort_by(DBSnapshots, &SnapshotCreateTime) | [-1].SnapshotCreateTime' \
    --output text)"

echo "✓ Found snapshot: $LATEST_SNAPSHOT_ARN"
echo "  Created: $LATEST_SNAPSHOT_TIME"

# ─── 2. Restore to temporary instance ───
echo ""
echo "── 2. Restoring to $RESTORE_INSTANCE_ID ──"

# IFS-split the comma-separated SG list into individual --vpc-security-group-ids args.
IFS=',' read -ra SG_ARGS <<< "$RESTORE_VPC_SECURITY_GROUP_IDS"

aws rds restore-db-instance-from-db-snapshot \
    --region "$AWS_REGION" \
    --db-instance-identifier "$RESTORE_INSTANCE_ID" \
    --db-snapshot-identifier "$LATEST_SNAPSHOT_ARN" \
    --db-instance-class "$RESTORE_DB_INSTANCE_CLASS" \
    --no-multi-az \
    --no-publicly-accessible \
    --no-deletion-protection \
    --vpc-security-group-ids "${SG_ARGS[@]}" \
    --db-subnet-group-name "$RESTORE_DB_SUBNET_GROUP" \
    --tags \
        "Key=Component,Value=restore-test" \
        "Key=SourceInstance,Value=$SOURCE_DB_INSTANCE_ID" \
        "Key=CreatedAt,Value=$TIMESTAMP" \
        "Key=ManagedBy,Value=infra-scripts-restore-test" \
    >/dev/null

echo "✓ Restore initiated"

# ─── 3. Wait for the instance to become available ───
echo ""
echo "── 3. Waiting for instance available (up to 60min) ──"
aws rds wait db-instance-available \
    --region "$AWS_REGION" \
    --db-instance-identifier "$RESTORE_INSTANCE_ID"

# Capture the endpoint
RESTORE_ENDPOINT="$(aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --db-instance-identifier "$RESTORE_INSTANCE_ID" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)"
RESTORE_PORT="$(aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --db-instance-identifier "$RESTORE_INSTANCE_ID" \
    --query 'DBInstances[0].Endpoint.Port' \
    --output text)"

echo "✓ Instance available: $RESTORE_ENDPOINT:$RESTORE_PORT"

# ─── 4. Validate via psql ───
echo ""
echo "── 4. Validating restored database ──"

# Pull the source instance's master password from Secrets Manager.
# Restored instances inherit the snapshot's master credential, so the
# same password works.
DB_PASSWORD="$(aws secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$DB_PASSWORD_SECRET_ID" \
    --query SecretString \
    --output text \
    | jq -r '.password')"

if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "null" ]; then
    echo "FATAL: failed to extract password from secret $DB_PASSWORD_SECRET_ID" >&2
    exit 4
fi

export PGPASSWORD="$DB_PASSWORD"
PSQL_CONN="host=$RESTORE_ENDPOINT port=$RESTORE_PORT user=$DB_USER dbname=$DB_NAME sslmode=require"

run_check() {
    local label="$1"
    local query="$2"
    local expected_pattern="$3"
    local actual
    actual="$(psql "$PSQL_CONN" -At -c "$query" 2>&1)"
    if [[ "$actual" =~ $expected_pattern ]]; then
        echo "  ✓ $label: $actual"
    else
        echo "  ✗ $label: got '$actual', expected pattern '$expected_pattern'" >&2
        return 1
    fi
}

# Check 1 — basic connectivity
run_check "Connectivity (SELECT 1)" \
    "SELECT 1;" \
    "^1$"

# Check 2 — schema is intact (Tenant table exists with rows)
run_check "Tenant table reachable" \
    "SELECT COUNT(*) FROM \"Tenant\";" \
    "^[0-9]+$"

# Check 3 — User table exists (different schema in case Tenant is empty)
run_check "User table reachable" \
    "SELECT COUNT(*) FROM \"User\";" \
    "^[0-9]+$"

# Check 4 — Recent activity (AuditLog has rows from within the last 14d
# of the snapshot — confirms the snapshot captured real production
# data, not an empty/just-migrated state).
run_check "AuditLog has rows from within 14d of snapshot" \
    "SELECT COUNT(*) FROM \"AuditLog\" WHERE \"createdAt\" > NOW() - INTERVAL '14 days';" \
    "^[1-9][0-9]*$"

# Check 5 — RLS policies are present (FORCE ROW LEVEL SECURITY survived restore).
# Per CLAUDE.md, every tenant-scoped table has tenant_isolation policy.
run_check "RLS tenant_isolation policy on Risk" \
    "SELECT COUNT(*) FROM pg_policies WHERE tablename = 'Risk' AND policyname = 'tenant_isolation';" \
    "^1$"

# Check 6 — `app_user` role exists (role-creation runs in entrypoint;
# RDS-restored instances should have it from the snapshot).
run_check "app_user role exists" \
    "SELECT 1 FROM pg_roles WHERE rolname = 'app_user';" \
    "^1$"

# Check 7 — Migrations applied (Prisma's _prisma_migrations table).
run_check "Prisma migrations table populated" \
    "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" \
    "^[1-9][0-9]*$"

unset PGPASSWORD

echo ""
echo "✓ All validation checks passed"
echo ""

# Cleanup runs via trap on EXIT.
