# 2026-06-09 — Per-policy connection + folder-select export (SP-F1)

**Commit:** `<sha>` feat(integrations): per-policy spConnectionId + folder-select export (SP-F1)

Closes two SP-4/SP-5 deferrals.

## What

- **Per-policy `spConnectionId`.** SP-4 assumed one SharePoint connection per
  tenant (push/pull/renew resolved "the first"). `Policy.spConnectionId` now
  records which connection backs each link; `link` stores it and
  push/pull/unlink/conflict/status resolve the policy's *own* connection
  (falling back to the first for pre-SP-F1 links). Multi-connection tenants now
  sync each policy through the right account.
- **Folder-select export targeting.** `SharePointFilePicker` gains a
  `folderSelect` mode (files render read-only; the footer becomes "Use this
  folder" → `onConfirmFolder({ driveId, folderId, folderName })`). The audit-pack
  export button uses it, so packs can land in a chosen library *folder* instead
  of always the drive root (the SP-5 export usecase already accepted `folderId`).

## Decisions

- `spConnectionId` is nullable + falls back to the first connection — old links
  keep working without a backfill.
- The folder picker reuses the existing navigation (breadcrumb + browse route);
  no new endpoint. Files show greyed so the user keeps context while choosing a
  destination.

## Files

| File | Change |
| --- | --- |
| `prisma/schema/compliance.prisma` + migration | `Policy.spConnectionId`. |
| `usecases/policy-sharepoint-sync.ts` | store + resolve the per-policy connection. |
| `components/integrations/sharepoint/SharePointFilePicker.tsx` | `folderSelect` mode. |
| `audits/packs/[packId]/SharePointExportButton.tsx` | pick a destination folder. |
