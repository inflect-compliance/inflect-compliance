-- In-app notification types for the NIS2 Article 23 deadline-clock job
-- (incident-notification-deadlines). DUE fires on entry to a deadline's
-- lead window; OVERDUE is the loud one — a regulatory deadline lapsed.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INCIDENT_DEADLINE_DUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INCIDENT_DEADLINE_OVERDUE';
