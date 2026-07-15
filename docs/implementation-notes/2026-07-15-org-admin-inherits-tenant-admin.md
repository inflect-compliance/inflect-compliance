# 2026-07-15 — ORG_ADMIN inherits tenant ADMIN (was AUDITOR)

**Commit:** `<pending> feat(org): ORG_ADMIN inherits tenant ADMIN across child tenants`

## Design

The Epic O-2 hub-and-spoke org model auto-provisions a `TenantMembership`
for every ORG_ADMIN into every child tenant of the org, tagged with
`provisionedByOrgId`. That inherited role was **AUDITOR** (read-only) —
which surfaced in practice as "an org admin can see, but can't operate,
their own tenants." Product decision: an ORG_ADMIN is a customer
administrator and should inherit full tenant **ADMIN** across the org.

The change is deliberately small and lives entirely in the provisioning
engine + its audit vocabulary — the fan-out/fan-in lifecycle, the
`provisionedByOrgId` tagging, the `skipDuplicates` manual-row preservation,
and the deprovision predicate shape are all unchanged; only the role value
moved AUDITOR → ADMIN.

**Ceiling is ADMIN, not OWNER** — an inherited role must never grant
`admin.tenant_lifecycle` / `admin.owner_management` (delete tenant, rotate
DEK, transfer/assign ownership). ADMIN denies both by type
(`getPermissionsForRole`), so org admins operate tenants without being able
to destroy them or seize ownership.

**Safety argument shifted, not weakened.** The old no-auto-join
justification leaned on "the role is read-only AUDITOR (never higher)."
That's gone. The membership is still not auto-join: a row is created ONLY
for a user who already holds `OrgMembership(role=ORG_ADMIN)` — the
precondition, not a role ceiling, is what bounds the grant. Manual
memberships (`provisionedByOrgId IS NULL`) are still never overwritten.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/org-provisioning.ts` | Fan-out (×2) writes `Role.ADMIN`; deprovision predicate filters `role = ADMIN`. |
| `src/app-layer/usecases/org-members.ts` | Per-tenant audit actions renamed `ORG_AUDITOR_{,DE}PROVISIONED` → `ORG_ADMIN_{,DE}PROVISIONED`; audit `detailsJson.role` now `ADMIN`. |
| `src/app-layer/usecases/org-invites.ts`, `portfolio.ts`, `org-tenants.ts`, `org-security-initiative.ts` | Comment/doc + audit-payload accuracy (AUDITOR → ADMIN). Portfolio fan-out integrity logic unchanged (already role-agnostic). |
| `prisma/migrations/20260715140000_org_admin_inherits_tenant_admin/` | Backfill: `UPDATE TenantMembership SET role='ADMIN' WHERE provisionedByOrgId IS NOT NULL AND role='AUDITOR'`. Upgrades existing org admins in place; manual rows untouched; no OWNER-count change so the last-OWNER trigger stays quiet. |
| `messages/{en,bg}.json` | 7 org-admin-facing strings (promotion/demotion callouts, role descriptions, member/tenant subtitles) reworded AUDITOR → ADMIN. The unrelated auditor-portal / EXTERNAL_AUDITOR / Role-label strings are deliberately left. |
| `tests/guardrails/no-auto-join.test.ts` | Allowlist reason rewritten to the precondition-based safety argument. |

## Decisions

- **Backfill existing rows** (vs new-grants-only): the intent is "not
  auditor as now", so a one-shot migration upgrades current
  auto-provisioned AUDITOR rows. Scoped strictly to
  `provisionedByOrgId IS NOT NULL AND role = 'AUDITOR'`.
- **Preserve manual roles**: a manually-set tenant role still wins —
  `skipDuplicates` means inheritance never overwrites a deliberate
  per-tenant grant (including a deliberate downgrade). Only auto-provisioned
  rows change.
- **Rename the per-tenant audit actions** rather than leave
  `ORG_AUDITOR_PROVISIONED` describing an ADMIN grant — the audit trail is
  compliance-critical and must not lie about the role it granted. Historical
  rows keep their old action string (append-only ledger).
- **Left lowercase observability identifiers** (`portfolio.auditor_fanout_drift`,
  `checkAuditorFanOutIntegrity`) unchanged to avoid breaking dashboards/alerts;
  they name the "fan-out integrity" concept, not the role.
