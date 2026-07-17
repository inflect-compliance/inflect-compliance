-- IN_REVIEW work-item status: the reviewer sign-off gate state.
ALTER TYPE "WorkItemStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW' BEFORE 'BLOCKED';

-- INCIDENT task-link entity type: lets a task be linked to a NIS2 Incident,
-- so the incident detail page can surface its linked tasks.
ALTER TYPE "TaskLinkEntityType" ADD VALUE IF NOT EXISTS 'INCIDENT';
