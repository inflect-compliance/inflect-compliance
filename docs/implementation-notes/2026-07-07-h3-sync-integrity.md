# 2026-07-07 — H3: sync & write-path data integrity

**Commit:** `<pending>` fix(h3): truncation-safe sync, departure reconcile, device caps + token authz

## Design

The directory/roster sync jobs silently truncated large populations and
reconciled against the partial result — corrupting the roster that offboarding
checks depend on (wrongful mass-deprovisioning).

### 1. Identity-sync fails closed on a partial enumeration
Okta/Google enumerate only `while (out.length < MAX_USERS)` with **no
truncation signal**. `identity-sync` then flips every account NOT in the `seen`
set to `DEPROVISIONED` — so a directory >5000 wrongly deprovisions accounts
5001+ every sync.

Fix — `listAccounts` now returns `{ accounts, complete }`:
- Okta: `complete = (link rel=next was null)`; Google: `complete = (no
  nextPageToken)`. A cap-stop with more pages ⇒ `complete: false`.
- `identity-sync`: on `!complete` it upserts what it saw (additive, safe),
  **skips the deprovision reconcile entirely**, and fails the execution ERROR.
  The reconcile runs ONLY on a confirmed-complete enumeration.

**Transaction premise was stale.** The roadmap flagged "upsert + reconcile not
transactional" — true on the divergent Prisma-5 branch, but on this repo
`runInTenantContext` already wraps the whole callback in one `$transaction`
(RLS `SET LOCAL`), so they're already atomic. Verified, documented, no change.

### 2. HRIS: truncation-safe + departure reconcile
`fetchBambooRoster` did `rows.slice(0, MAX_EMPLOYEES)` and `runHrisSync` only
upserted present rows — so a truncated roster reported PASSED, and an employee
**deleted** from BambooHR stayed `ACTIVE` forever (invisible to offboarding).
- `listEmployees` returns `{ employees, complete }`; a `rows.length >
  MAX_EMPLOYEES` roster is `complete: false` → sync fails ERROR, no reconcile.
- On a complete roster, `source=HRIS` employees absent from it are reconciled
  to `TERMINATED` (guarded on a non-empty roster so an empty-but-complete
  response never mass-terminates).

### 3. Device write caps + token authz
- `reportDevice` enforces `MAX_DEVICES_PER_TENANT = 10000` on NEW serials
  (existing-serial updates always allowed) — bounds a leaked/looping token from
  creating unlimited rows. (Pairs with the H1 edge rate-limit.)
- The device-token `lastUsedAt` touch is throttled to once / 5 min so a
  high-frequency agent doesn't drive a DB write per report.
- `issueDeviceToken`/`revokeDeviceToken` now require `admin.manage` (was
  `personnel.manage || canAdmin`, a privilege drift below the route's
  `admin.manage`) — matches the route + `route-permissions.ts`; docstrings fixed.

## Files

| File | Role |
| --- | --- |
| `providers/identity/types.ts` | `ListAccountsResult { accounts, complete }` |
| `providers/{okta,google-workspace}/index.ts` | truncation detection on pagination |
| `usecases/identity-sync.ts` | abort on partial; reconcile only when complete |
| `providers/hris/index.ts` | `ListEmployeesResult`; roster truncation signal |
| `usecases/hris-sync.ts` | truncation abort + departed-employee reconcile |
| `usecases/device.ts` | per-tenant device cap; token authz → admin.manage |
| `lib/auth/device-token-auth.ts` | throttled lastUsedAt touch |

## Decisions

- **Upsert-but-don't-reconcile on truncation** (not a hard abort-before-write):
  the upserts are idempotent + additive and keep the observed accounts fresh;
  only the destructive deprovision/terminate reconcile is unsafe on partial
  data, so only that is skipped — and the ERROR status surfaces the truncation.
- **Departure reconcile guarded on a non-empty roster** — an empty-but-complete
  BambooHR response is far more likely an API glitch than a genuine
  everyone-gone event, so it never mass-terminates.
- **The `take: 10000` manager-resolution read stays** — it's a bounded read of
  the LOCAL employee table (guardrail policy), not the external roster; the
  roster slice was the real truncation bug.
