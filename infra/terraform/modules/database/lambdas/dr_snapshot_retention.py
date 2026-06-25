"""
DR snapshot retention — daily sweeper for cross-region snapshot copies.

Runs daily in the DR region. Deletes DR-copied snapshots (tagged
dr-copy=true by dr_snapshot_copy.py) older than RETENTION_DAYS. Kept
separate from the copy Lambda (single responsibility) — a copy bug can
never delete, and a retention bug can never block a copy.

Only ever touches snapshots tagged dr-copy=true, so it cannot delete
unrelated manual snapshots an operator created in the DR region.

Env:
  DR_REGION       region to sweep
  RETENTION_DAYS  delete copies older than this many days
"""
import datetime
import os

import boto3


def handler(_event, _context):
    dr_region = os.environ["DR_REGION"]
    retention_days = int(os.environ.get("RETENTION_DAYS", "35"))
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=retention_days)

    rds = boto3.client("rds", region_name=dr_region)
    deleted, kept = [], 0

    paginator = rds.get_paginator("describe_db_snapshots")
    for page in paginator.paginate(SnapshotType="manual"):
        for snap in page.get("DBSnapshots", []):
            arn = snap["DBSnapshotArn"]
            tags = {
                t["Key"]: t["Value"]
                for t in rds.list_tags_for_resource(ResourceName=arn).get("TagList", [])
            }
            # Guard: only our DR copies are eligible for deletion.
            if tags.get("dr-copy") != "true":
                continue
            created = snap.get("SnapshotCreateTime")
            if created is not None and created < cutoff:
                rds.delete_db_snapshot(DBSnapshotIdentifier=snap["DBSnapshotIdentifier"])
                deleted.append(snap["DBSnapshotIdentifier"])
            else:
                kept += 1

    print(f"retention sweep ({dr_region}): deleted={len(deleted)} kept={kept} cutoff={cutoff.isoformat()}")
    return {"deleted": deleted, "kept": kept}
