"""
DR snapshot copy — EventBridge-triggered cross-region RDS snapshot copy.

Fires on every automated-snapshot-creation event for the source DB
instance. Copies that snapshot into the DR region, re-encrypted with the
DR-region multi-region KMS key, and tags it for the retention sweeper.

Single responsibility: COPY only. Retention is a separate Lambda
(dr_snapshot_retention.py) so each is easy to reason about + audit.

Env:
  DR_REGION       destination region for the copy
  SOURCE_REGION   region the automated snapshot lives in
  DR_KMS_KEY_ARN  multi-region CMK (DR-region ARN) for re-encryption
  RETENTION_DAYS  stamped as a tag the retention sweeper reads
"""
import datetime
import os
import re

import boto3


def _target_id(source_id: str) -> str:
    # Manual snapshot ids cannot contain ':' (automated ids look like
    # "rds:inflect-...-2026-06-25-04-12"). Sanitize to [a-zA-Z0-9-],
    # prefix with "dr-", and clamp to the 255-char RDS limit.
    safe = re.sub(r"[^a-zA-Z0-9-]", "-", source_id).strip("-")
    return ("dr-" + safe)[:255]


def handler(event, _context):
    detail = event.get("detail", {})
    # RDS snapshot events carry the snapshot ARN in SourceArn and the
    # short id in SourceIdentifier; prefer the ARN for the cross-region
    # copy source, fall back to reconstructing from the id.
    source_arn = detail.get("SourceArn") or ""
    source_id = detail.get("SourceIdentifier") or source_arn.split(":snapshot:")[-1]
    if not source_arn and not source_id:
        raise ValueError(f"event missing snapshot identifier: {event!r}")

    dr_region = os.environ["DR_REGION"]
    source_region = os.environ["SOURCE_REGION"]
    kms_key = os.environ["DR_KMS_KEY_ARN"]
    retention_days = os.environ.get("RETENTION_DAYS", "35")

    target_id = _target_id(source_id)
    dst = boto3.client("rds", region_name=dr_region)

    resp = dst.copy_db_snapshot(
        SourceDBSnapshotIdentifier=source_arn or source_id,
        TargetDBSnapshotIdentifier=target_id,
        # Re-encrypt under the DR-region CMK (cross-region copy of an
        # encrypted snapshot REQUIRES a key in the destination region).
        KmsKeyId=kms_key,
        SourceRegion=source_region,
        CopyTags=True,
        Tags=[
            {"Key": "dr-copy", "Value": "true"},
            {"Key": "dr-retention-days", "Value": str(retention_days)},
            {"Key": "source-snapshot", "Value": source_id},
            {"Key": "copied-at", "Value": datetime.datetime.now(datetime.timezone.utc).isoformat()},
        ],
    )
    arn = resp["DBSnapshot"]["DBSnapshotArn"]
    print(f"copied {source_id} -> {arn} ({dr_region})")
    return {"target_id": target_id, "target_arn": arn, "dr_region": dr_region}
