# 2026-07-17 — Auditor portal retirement + honest hub IA + custom-framework cycles + account-level auditor revoke

**Commit:** `<pending> feat(audit): retire auditor portal, honest hub cross-links, any-installed-framework cycles, account-level auditor revoke (PR-O)`

## Design

Four independent remediations on the audit surface, grouped because they all
touch the audit hub / auditor lifecycle.

1. **Retire the internal auditor portal.** The `/audits/auditor` page and its
   `/api/.../audits/auditor/packs` route were a half-built in-app view for
   external auditors that duplicated what the share-link flow already does
   (freeze pack → send tokened link → auditor comments back). External auditors
   have no tenant login, so an in-app portal was the wrong model. Both routes
   and the `getAuditorAssignedPacks` usecase are removed; the share-link flow is
   the single external-auditor path.

2. **Honest hub information architecture.** The hub header mixed true `/audits`
   children (nis2-gap, business-continuity) with cross-links to separate
   top-level routes (frameworks, security-testing, findings, incidents) and
   commented them all as "subpages of Internal Audit". The cross-links are now
   grouped under a "Related" label as `ghost`/`sm` pills, visually and in
   comments distinguished from the true children, so the IA doesn't lie about
   what nests under what.

3. **Cycles for any installed framework.** `createAuditCycle` hardcoded an
   `['ISO27001','NIS2']` allowlist even though the readiness scorer already
   dispatches unknown keys to `computeGenericReadiness`. The allowlist is
   replaced by an installed-framework lookup (`framework.findFirst`) — a cycle
   can be created for any framework installed for the tenant, and the New Cycle
   form now fetches the installed frameworks (with their versions) rather than
   offering only the two hardcoded options.

4. **Account-level auditor revoke + visible reactivation.** `AuditorAccount`
   carried a `REVOKED` status the UI could render but nothing could set — the
   only revoke was per-pack. Added `revokeAuditorAccount` (flips status →
   REVOKED and drops all pack grants) + a DELETE route + a management-UI button.
   Symmetrically, `inviteAuditor`'s upsert silently reactivated a REVOKED
   account; it now detects the prior status and returns `reactivated`, logs
   `AUDITOR_REACTIVATED` vs `AUDITOR_INVITED`, and the UI shows a distinct
   "reactivated" toast.

## Files

| File | Role |
| --- | --- |
| `src/app/t/.../audits/auditor/` (deleted) | Retired portal page |
| `src/app/api/t/.../audits/auditor/packs/route.ts` (deleted) | Retired portal packs route |
| `src/app-layer/usecases/audit-hardening.ts` | Removed `getAuditorAssignedPacks` + now-unused imports |
| `src/app/t/.../audits/AuditsClient.tsx` | Grouped cross-links under "Related"; honest comments |
| `src/lib/nav/page-segregation.ts`, `canonical-parents.ts` | Dropped the `/audits/auditor` entries |
| `src/app-layer/usecases/audit-readiness/cycles.ts` | Installed-framework check replaces the ISO/NIS2 allowlist |
| `src/app/t/.../audits/cycles/page.tsx` | Fetch installed frameworks for the New Cycle picker |
| `src/app-layer/usecases/audit-readiness/sharing.ts` | `inviteAuditor` surfaces `reactivated`; new `revokeAuditorAccount` |
| `src/app-layer/usecases/audit-readiness/index.ts` | Barrel-export `revokeAuditorAccount` |
| `src/app/api/t/.../audits/auditors/[auditorId]/route.ts` (new) | DELETE → account-level revoke |
| `src/app/t/.../audits/auditors/page.tsx` | Account-revoke button + confirm + reactivation toast |
| `messages/en.json`, `bg.json` | `hub.related`, auditor revoke/reactivate strings; dropped `hub.auditorPortal` |

## Decisions

- **Retire, not build out.** The portal duplicated the share-link flow and
  assumed a tenant login external auditors don't have. Retiring is less code and
  removes a misleading half-feature; the acceptance criteria explicitly preferred
  (a) retire.
- **Installed-framework lookup, not "any string".** A cycle for a key with no
  installed requirements would score 0% coverage forever with no signal, so the
  check still requires the framework to be installed — it just no longer
  hardcodes *which*.
- **`reactivated` is a returned flag, not a second endpoint.** Re-invite already
  does the right thing (flip to ACTIVE); the only gap was that it was invisible.
  Surfacing a flag keeps one code path and one endpoint.
- **Guardrail housekeeping.** Removing `getAuditorAssignedPacks` dropped the last
  `findMany` on `AuditorPackAccess`, so its `LIST_MODELS_TENANT_INDEX_SUFFICIENT`
  entry and the pageheader-adoption registry entry for the deleted page were
  removed in the same diff (both ratchets fail on stale entries).
