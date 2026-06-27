-- Email notification type for the policy review-due reminder job.
ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'POLICY_REVIEW_DUE';
