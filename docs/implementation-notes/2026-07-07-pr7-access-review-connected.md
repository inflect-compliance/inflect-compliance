# 2026-07-07 — PR-7: Access reviews — CONNECTED_APP scope (verify-and-extend)

**Commit:** _(pending)_ `feat(access-reviews): CONNECTED_APP scope over connected identity accounts`

## Verify-and-extend finding

The member-based access-review workflow (create → snapshot → per-subject
decisions → close with REVOKE/MODIFY execution + last-OWNER guard + signed
evidence PDF, `ALL_USERS` / `ADMIN_ONLY` / `CUSTOM` scopes) is **already fully
shipped** on `main` — 10 test files, RLS integration, closeout, PDF. The
roadmap's PR-7 premise ("build the whole workflow") is ~90% stale.

The **genuine gap** — unlocked by PR-2's `ConnectedIdentityAccount` — is the
`CONNECTED_APP` scope: reviewing Okta / Google Workspace accounts rather than
tenant memberships.

## Design

`AccessReviewDecision` is membership-centric with a **required `subjectUser`
FK to `User`** — connected accounts have no tenant user. Making that model
generic (nullable FK across ~25 read-sites of a security-critical, closeout-
bearing flow) is high-risk and can't be validated locally (member integration
tests are DB-backed). So the extension is **additive**:

- New `AccessReviewConnectedDecision` table (parallel to `AccessReviewDecision`)
  — the subject is a `ConnectedIdentityAccount`, the entitlement frozen into
  `snapshotJson`. The mature member model is **100% untouched**.
- `AccessReviewScope.CONNECTED_APP` enum value.
- `access-review-connected.ts` (separate module): `createConnectedAccessReview`
  (snapshot active connected accounts into decisions), `submitConnectedDecision`,
  `closeConnectedAccessReview` (reject pending → REVOKE/MODIFY emits a
  **remediation Task**, not an automatic IdP write-back → mark executed → close).
- The existing close route **dispatches by scope**: `CONNECTED_APP` → the
  connected close; everything else → the untouched member `closeAccessReview`.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/{enums,auth,compliance}.prisma` + migration | `CONNECTED_APP` + `AccessReviewConnectedDecision` (RLS) |
| `usecases/access-review-connected.ts` | create / submit / close (parallel to member flow) |
| `api/.../access-reviews/connected` + `.../connected-decisions/**` | REST |
| `api/.../access-reviews/[reviewId]/close/route.ts` | scope dispatch (member flow untouched) |

## Decisions

- **Additive table over generic refactor.** Isolating connected decisions in
  their own table eliminates regression risk to the load-bearing member closeout
  (last-OWNER guard, RLS, PDF) that can't be locally validated.
- **REVOKE emits a remediation task, not an automatic deprovision.** Writing back
  to the IdP is a gated, out-of-band action; the review produces the actionable
  signal + audit trail.
- **UI deferred.** The connected-review workflow is API-complete; a create-form
  scope toggle + connected-decision rendering on the existing detail page is a
  documented follow-up.
