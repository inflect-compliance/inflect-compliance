# 2026-07-21 — Admin privacy & data-protection posture page

**Commit:** `<pending>` feat(admin): read-only privacy & data-protection posture page

## Design

A new `/admin/privacy` page reporting how a tenant's data is protected,
retained, and located, folded into the admin landing page under a new
**Privacy & data** section.

The page is a **Server Component and read-only by construction**. Every item it
shows is either configured on the surface that owns it (per-record evidence
retention, vendor sub-processor relationships) or is not tenant-configurable at
all (sweep windows, residency region, key rotation). Adding setters here would
have implied tenant-level knobs the backend does not have.

### The reason this page is shaped the way it is

An audit of the privacy surface area before writing any code found that the
obvious version of this page would have been substantially dishonest:

| Area | What exists | What the page therefore does |
| --- | --- | --- |
| DSAR (GDPR Art.15/17) | `DataSubjectRequest` model + enums + `evaluateDsarRejection`. **Both jobs throw unconditionally and are unregistered.** No usecase, no route, no write path. | Explicit "intake is not enabled" notice. **No request queue, no intake form.** |
| Data residency | `Tenant.region`, immutable, set at creation. `OPERATIONALLY_PROVISIONED_REGIONS` contains only `US_EAST_1`. | Region shown, plus a standing notice that this is a *commitment*, not a statement about where bytes live. |
| Retention | `data-lifecycle.ts` sweep with module constants (90d soft-delete, 365d evidence). No tenant-level setting anywhere. | Shown as *platform defaults*, labelled as such. |
| Encryption / DEK | Real: per-tenant DEK, rotation routes, `previousEncryptedDek` during rotation. API-only, no UI existed. | Genuine live status — the strongest real content on the page. |
| Sub-processors | Real: `Vendor.isSubprocessor` + `VendorRelationship` with purpose/dataTypes/country. | Counts, pointing at vendor detail where they are maintained. |
| Audit streaming | Real consumer; `auditStreamUrl` has **no write path** (settings route is GET-only). | Configured / not configured, read-only. |

A DSAR queue was the tempting build — the model is right there, and a
`RECEIVED → VERIFIED → COMPLETED` UI would demo well. It would also let an
administrator mark an erasure request "completed" while nothing was erased. On
a compliance product, where a DPO or auditor may rely on that record, this is
the one failure mode worth engineering against, so the capability gap is
surfaced instead of papered over.

### Honesty flags carried in the data, not the copy

`PrivacyPosture` carries `dsar.intakeEnabled`, `retention.tenantConfigurable`
and `residency.declarativeOnly` as explicit fields, and the page branches on
them. The claim therefore cannot drift from the backend by editing a string:
enabling the real feature means flipping a flag, which fails the unit test that
pins it. That is the intended tripwire.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/privacy-posture.ts` | `getPrivacyPosture` — admin-gated, tenant-scoped read aggregate |
| `src/app/t/[tenantSlug]/(app)/admin/privacy/page.tsx` | Server Component rendering the posture cards |
| `src/app/t/[tenantSlug]/(app)/admin/page.tsx` | New "Privacy & data" section + Privacy pill |
| `src/lib/nav/page-segregation.ts` | `/admin/privacy` registered as a subpage |
| `messages/{en,bg}.json` | `admin.privacy.*`, `admin.section.privacyData`, `admin.nav.privacy` |
| `tests/unit/privacy-posture.test.ts` | Pins the capability flags and tenant scoping |

## Decisions

- **No API route.** The admin subtree is already gated by `AdminLayout` +
  edge middleware, and the page is a Server Component calling the usecase
  directly. Adding a route would have introduced an
  `api-permission-coverage` surface for zero benefit — there is nothing to
  fetch client-side because nothing on the page changes without a reload.

- **Its own admin section rather than a Security pill.** Privacy spans
  residency, retention, sub-processors and DSAR; filing it under Security
  would bury the data-protection story a DPO comes looking for.

- **`residency.declarativeOnly` is hardcoded `true`, not derived.** Production
  being single-region is a property of the deployment, not of any queryable
  state. Deriving it from `isProvisionedRegion` would be wrong: a provisioned
  region still does not mean residency is *enforced*. The unit test asserts
  both together so the distinction survives.

- **Counts, not lists, for sub-processors.** The vendor detail page already
  owns that relationship including purpose/dataTypes/country. Re-rendering the
  list here would create a second place to maintain it.

## Follow-ups this audit surfaced (not addressed here)

- The vendor sub-processor routes
  (`/api/t/[tenantSlug]/vendors/[vendorId]/subprocessors`) call no
  `requirePermission` and have no entry in `route-permissions.ts`. They are
  gated only by tenant membership, so any member can read or modify
  sub-processor relationships. Worth a follow-up — it is an authz gap, not a
  privacy-page concern.
- `TenantSecuritySettings.auditStreamUrl`, `incidentAuthority` and
  `maxConcurrentSessions` have no write path; the admin settings route is
  GET-only. The audit-stream card is read-only for that reason.
- DSAR Stage 2/3 (`docs/dsar.md`) would make the intake card actionable.
