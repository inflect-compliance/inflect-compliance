# 2026-07-18 — Policy version & approval integrity

**Commit:** `<sha>` fix(policy): author-aware SoD, reversible rollback, ApprovalBanner + version-diff wiring

## Design

Five gaps in the policy version/approval surface, closed together because
they share the detail payload and the same review-integrity theme.

1. **ApprovalBanner never rendered.** `PolicyRepository.getById` nested
   approvals only under `versions[].approvals`; the banner reads
   `policy.approvals` (top-level). The DTO already declared a top-level
   `approvals` array (`PolicyDetailDTOSchema`), so it was contract-shaped
   but always `undefined` at runtime. Added a top-level `approvals` include
   (ordered `createdAt desc` — `PolicyApproval` has no `requestedAt`) so the
   banner has its data.

2. **Separation-of-duties was requester-only.** `decidePolicyApproval`
   refused approval when `ctx.userId === approval.requestedByUserId`, but a
   user could author a version (`PolicyVersion.createdById`) and then approve
   it as long as someone *else* clicked "request review". Added an
   author-aware check: on `APPROVED`, load the target version's `createdById`
   and refuse if it equals `ctx.userId`. The UI mirrors this — the per-version
   Approve button is `disabled` + tooltip when the viewer requested **or**
   authored the change (client-side hint; the server is authoritative).

3. **Rollback was one-way + lossy.** `rollbackPolicy` popped the target off
   `lifecycleHistoryJson` and re-pointed `currentVersionId`, but never
   snapshotted the *outgoing* current version — so a rollback could not be
   rolled forward. Now the outgoing current version is pushed onto the history
   (bounded by `MAX_LIFECYCLE_HISTORY`) before the target is applied, making
   rollback reversible. Guards added: refuse on `ARCHIVED` (restore first), and
   a post-commit best-effort `pushPolicyToSharePoint` so the external mirror
   tracks the reverted content.

4. **Version-diff picker was controlled-only.** `<VersionDiff>` required a
   parent to thread `from`/`to`; standalone it rendered inert. Added
   uncontrolled internal `fromId`/`toId` state (still calls
   `onSelectionChange` when a parent supplies it).

5. **Blank-create dropped `contentType`.** The POST route forwarded every
   create field except `contentType`, so a WYSIWYG (HTML) first version
   round-tripped as MARKDOWN. One-line forward.

## Files

| File | Role |
|------|------|
| `src/app-layer/repositories/PolicyRepository.ts` | top-level `approvals` include on `getById` |
| `src/app-layer/usecases/policy.ts` | author-aware SoD in `decidePolicyApproval`; reversible `rollbackPolicy` (snapshot outgoing, ARCHIVED guard, SharePoint push) |
| `src/app/api/t/[tenantSlug]/policies/route.ts` | forward `contentType` at blank create |
| `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx` | pass `currentUserId` to ApprovalBanner; client-side SoD disable+tooltip; rollback ConfirmDialog naming vN |
| `src/components/ui/VersionDiff.tsx` | uncontrolled from/to picker fallback |
| `messages/{en,bg}.json` | 4 keys under `policies.detail` |

## Decisions

- **SoD is enforced server-side; the client disable is a hint.** The button
  `disabled` state uses `requestedBy?.id` / `createdBy?.id` off the DTO —
  convenience, not the gate. `decidePolicyApproval` is the authority.
- **Rollback ConfirmDialog uses `tone="warning"`, not `"danger"`.** Rollback
  is now reversible (the outgoing version is snapshotted), so it is not a
  destructive erase; `tone="warning"` keeps `confirmLabel="Roll back to v{n}"`
  clear of the destructive-vocabulary ratchet (which only governs `danger`).
- **No DTO/OpenAPI change.** `PolicyDetailDTOSchema` already declared the
  top-level `approvals` array; populating it in `getById` is contract-neutral.
- **Single primary Button for the Approve control.** The self-approval and
  active states collapse into one conditionally-wrapped `<Button variant="primary">`
  (disabled `onClick={undefined}` when self-approval) rather than two, keeping
  the `primary-secondary-ratio` budget unchanged.
