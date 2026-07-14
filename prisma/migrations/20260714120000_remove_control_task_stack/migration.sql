-- TP-2 — retire the legacy ControlTask stack in favour of the unified Task.
--
-- The control-detail Tasks tab already renders UNIFIED tasks (via
-- LinkedTasksPanel); ControlTask was orphaned-but-routable with a divergent
-- 4-value status enum. This migration FIRST copies any residual ControlTask
-- rows into Task, THEN drops the table + its enum.
--
-- Status mapping (ControlTaskStatus -> WorkItemStatus):
--   OPEN        -> OPEN
--   IN_PROGRESS -> IN_PROGRESS
--   DONE        -> CLOSED
--   BLOCKED     -> BLOCKED
--
-- Task.createdByUserId is NOT NULL but ControlTask has no creator column, so
-- we resolve one via COALESCE(assignee, control creator, control owner, the
-- tenant's oldest OWNER). Rows that cannot resolve any creator (should not
-- happen — every tenant keeps at least one ACTIVE OWNER) are skipped rather
-- than violating the constraint.
--
-- Keys: Task.key is nullable + unique per (tenantId, key). We mint sequential
-- TSK-N keys per tenant continuing that tenant's TaskKeySequence, and advance
-- the sequence so future Task creates never collide with a backfilled key.

-- 1. Backfill unified Task rows from residual ControlTask rows.
WITH src AS (
    SELECT
        ct.id                AS ct_id,
        ct."tenantId"        AS tenant_id,
        ct."controlId"       AS control_id,
        ct.title             AS title,
        ct.description       AS description,
        ct."assigneeUserId"  AS assignee_user_id,
        ct."dueAt"           AS due_at,
        ct."createdAt"       AS created_at,
        ct."updatedAt"       AS updated_at,
        (CASE ct.status
            WHEN 'DONE'        THEN 'CLOSED'
            WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
            WHEN 'BLOCKED'     THEN 'BLOCKED'
            ELSE 'OPEN'
         END)::"WorkItemStatus" AS status,
        COALESCE(
            ct."assigneeUserId",
            c."createdByUserId",
            c."ownerUserId",
            (SELECT tm."userId"
               FROM "TenantMembership" tm
              WHERE tm."tenantId" = ct."tenantId"
                AND tm.role = 'OWNER'
              ORDER BY tm."createdAt" ASC
              LIMIT 1)
        ) AS created_by_user_id
    FROM "ControlTask" ct
    JOIN "Control" c ON c.id = ct."controlId"
),
numbered AS (
    SELECT
        src.*,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, ct_id) AS rn
    FROM src
    WHERE created_by_user_id IS NOT NULL
),
seqbase AS (
    SELECT n.tenant_id, COALESCE(tks."lastValue", 0) AS base
    FROM (SELECT DISTINCT tenant_id FROM numbered) n
    LEFT JOIN "TaskKeySequence" tks ON tks."tenantId" = n.tenant_id
)
INSERT INTO "Task" (
    id, "tenantId", type, title, description, severity, priority,
    status, source, key, "dueAt", "controlId", "assigneeUserId",
    "createdByUserId", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    n.tenant_id,
    'TASK'::"WorkItemType",
    n.title,
    n.description,
    'MEDIUM'::"WorkItemSeverity",
    'P2'::"WorkItemPriority",
    n.status,
    'MANUAL'::"WorkItemSource",
    'TSK-' || (sb.base + n.rn)::text,
    n.due_at,
    n.control_id,
    n.assignee_user_id,
    n.created_by_user_id,
    n.created_at,
    n.updated_at
FROM numbered n
JOIN seqbase sb ON sb.tenant_id = n.tenant_id;

-- 2. Advance each affected tenant's TaskKeySequence past the minted keys.
INSERT INTO "TaskKeySequence" ("tenantId", "lastValue")
SELECT tenant_id, COUNT(*)::int
FROM (
    SELECT ct."tenantId" AS tenant_id
    FROM "ControlTask" ct
    JOIN "Control" c ON c.id = ct."controlId"
    WHERE COALESCE(
        ct."assigneeUserId",
        c."createdByUserId",
        c."ownerUserId",
        (SELECT tm."userId"
           FROM "TenantMembership" tm
          WHERE tm."tenantId" = ct."tenantId"
            AND tm.role = 'OWNER'
          ORDER BY tm."createdAt" ASC
          LIMIT 1)
    ) IS NOT NULL
) x
GROUP BY tenant_id
ON CONFLICT ("tenantId")
DO UPDATE SET "lastValue" = "TaskKeySequence"."lastValue" + EXCLUDED."lastValue";

-- 3. Drop the legacy stack. The table has no inbound FKs (only outbound), so
-- dropping it also removes its own FK constraints; the enum is now unused.
DROP TABLE "ControlTask";

DROP TYPE "ControlTaskStatus";
