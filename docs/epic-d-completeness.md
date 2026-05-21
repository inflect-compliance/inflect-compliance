# Epic D — Isolation & Sanitisation Completeness (operator + contributor index)

> Three remediations that close the concrete gaps left after Epic C.
> Read the source files linked below for details; come back here for
> the architecture summary, verification commands, and rollback
> procedures.

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  D.1 — UserSession RLS                                                │
│        Migration 20260423150000_epic_d1_user_session_rls              │
│          ALTER TABLE "UserSession" ENABLE/FORCE ROW LEVEL SECURITY;   │
│          CREATE POLICY tenant_isolation                               │
│              USING ("tenantId" IS NULL OR "tenantId" = own)           │
│              WITH CHECK ("tenantId" = own);                           │
│          CREATE POLICY superuser_bypass                               │
│              USING (current_setting('role') != 'app_user');           │
│        SINGLE_POLICY_EXCEPTIONS += 'UserSession'                      │
│                                                                       │
│  D.2 — Sanitisation rollout                                           │
│        finding.ts / risk.ts / vendor.ts / audit.ts / control-test.ts  │
│          ─ sanitizePlainText(field) on create + update paths          │
│          ─ per-file sanitizeOptional() preserves undefined/null/string│
│        SANITISER_COVERAGE_FLOOR: 3 → 8                                │
│                                                                       │
│  D.3 — requireAdminCtx → requirePermission                            │
│        billing/{checkout,portal,events}, sso/, security/sessions/     │
│        revoke-{all,user}, security/mfa/policy PUT                     │
│          ─ 7 routes migrated → AUTHZ_DENIED audit on denial           │
│        PRIVILEGED_ROOTS += billing, sso, security                     │
│        EXCLUDED_ROUTES += 5 self-service routes (own MFA, own session)│
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

| Layer | Source of truth | Companion guardrail |
|---|---|---|
| D.1 — `UserSession` RLS | `prisma/migrations/20260423150000_epic_d1_user_session_rls/` | `tests/guardrails/rls-coverage.test.ts` (with `SINGLE_POLICY_EXCEPTIONS`) + `tests/integration/user-session-rls.test.ts` |
| D.2 — Encrypted-field sanitisation | `src/app-layer/usecases/{finding,risk,vendor,audit,control-test}.ts` calling `@/lib/security/sanitize` | `tests/guardrails/sanitize-rich-text-coverage.test.ts` (`SANITISER_COVERAGE_FLOOR`) + `tests/unit/security/sanitize-write-paths.test.ts` |
| D.3 — Legacy admin-route migration | The 7 migrated route files use `requirePermission(...)` from `@/lib/security/permission-middleware`; the canonical pattern is documented in `src/lib/auth/require-admin.ts`'s "STATUS — legacy / fallback only" header | `tests/guardrails/api-permission-coverage.test.ts` (with widened `PRIVILEGED_ROOTS` + 5-entry `EXCLUDED_ROUTES`) + `tests/unit/security/migrated-route-enforcement.test.ts` |

## Why each design choice

### D.1 — Asymmetric single-policy form is mandatory for nullable-tenant tables

`UserSession.tenantId` is nullable: the Epic C.3 docstring explains
that the very first JWT mint may precede tenant resolution, and the
sign-in path inserts NULL-tenant rows from the `recordNewSession`
helper running under `postgres` (superuser_bypass).

A standard Class-A pattern uses two permissive policies:

```sql
CREATE POLICY tenant_isolation        FOR ALL    USING ("tenantId" = own);
CREATE POLICY tenant_isolation_insert FOR INSERT WITH CHECK ("tenantId" = own);
```

Bolting on a third permissive policy to allow NULL reads:

```sql
CREATE POLICY tenant_isolation_null FOR ALL USING ("tenantId" IS NULL);
```

…would let `app_user` UPDATE a NULL row to *any* `tenantId`. Postgres
ORs permissive policies on the same command, and the new policy has
no `WITH CHECK` clause — so on UPDATE its USING admits the row and
its missing WITH CHECK implicitly grants `WITH CHECK (true)`. The
single-policy form combines `USING` and `WITH CHECK` in one rule,
guaranteeing they're evaluated as that policy's two halves with no
permissive sibling to OR with.

The `SINGLE_POLICY_EXCEPTIONS` post-loop sanity check in the
guardrail reads `qual` and `with_check` from `pg_policies` directly
and fails if either is null on a listed exception — so a future
"simplify" PR that strips one clause is caught with an actionable
error.

### D.2 — Encryption ≠ "safe to render"

The Epic B field-encryption middleware encrypts a value on write and
decrypts it on read. The byte sequence the application reads back is
the original user input. A `<script>` written into
`Finding.description` is encrypted on write, decrypted on read, and
arrives at every downstream consumer as a literal `<script>` in
plaintext.

Render-time React sanitisation covers ONE downstream consumer.
Three more (PDF export pipeline, audit-pack share-link receiver,
future SDK consumers) read the row verbatim and would render it.
Sanitising at the usecase layer means the row at rest is already
safe regardless of which consumer reads it next.

The `sanitize-rich-text-coverage` ratchet's `SANITISER_COVERAGE_FLOOR
= 8` makes the contract explicit: 8 known sanitised usecase files
(3 from Epic C.5, 5 from Epic D.2). A new file may be added (and
the floor bumped in the same PR); the floor cannot drop without a
written justification in the SAME PR.

### D.3 — `requirePermission` is the canonical admin-route pattern

`requireAdminCtx` (Epic A.3 era) checks role enum tier and throws
403 on mismatch. It works, but:

- It writes **no audit row** on denial. Auditors and SIEM consumers
  see nothing — only the request log shows a status code.
- It doesn't compose with the Epic C.1 `PermissionKey` model, so
  custom roles (`TenantCustomRole.permissionsJson` overrides) can't
  refine its decision.
- The Epic C.1 `api-permission-coverage` guardrail couldn't see it,
  so a future PR could revert to bare `getTenantCtx` (no role
  check) and slip through CI.

Migrated routes now use `requirePermission(<key>, handler)`. Denials
flow through the Epic C.1 path: 403 with a generic message, audit
row with `entity: 'Permission'`, `entityId: '<key>'`, `action:
'AUTHZ_DENIED'`, `detailsJson.category: 'access'`.

**2026-05-21 follow-up — legacy helper removed.** Once every route
had migrated, `src/lib/auth/require-admin.ts` (and its
`requireAdminCtx` / `requireWriteCtx` / `requireRoleCtx` exports)
was deleted outright — it had zero production call sites left.
`requirePermission` is now the only admin-authorization guard. The
ratchet `tests/guardrails/no-legacy-admin-guard.test.ts` fails CI if
any of those identifiers, or the module that exported them,
reappears under `src/`.

## Verification runbook

Run the whole Epic D test bundle locally before promoting:

```bash
npx jest \
  tests/guardrails/rls-coverage.test.ts \
  tests/integration/user-session-rls.test.ts \
  tests/guardrails/sanitize-rich-text-coverage.test.ts \
  tests/unit/security/sanitize-write-paths.test.ts \
  tests/guardrails/api-permission-coverage.test.ts \
  tests/guardrails/admin-route-coverage.test.ts \
  tests/unit/security/migrated-route-enforcement.test.ts \
  --no-coverage
```

Expected: every suite green. Reference run-time on this repo: ≈ 4s.

### V.1 — UserSession RLS asymmetric semantics (D.1)

```bash
npx jest tests/integration/user-session-rls.test.ts --no-coverage
```

Verifies seven behaviours against a live Postgres:

| # | Test | Confirms |
|---|---|---|
| 1 | INSERT under `app_user` with own tenantId | `WITH CHECK (own)` accepts |
| 2 | INSERT under `app_user` with foreign tenantId | `WITH CHECK (own)` rejects |
| 3 | INSERT under `app_user` with NULL tenantId | `WITH CHECK` rejects NULL — only superuser path mints NULL |
| 4 | SELECT under `app_user` | Sees own + NULL, NOT foreign tenants |
| 5 | UPDATE under `app_user`: claim NULL row → foreign tenant | Asymmetric `USING` admits the row, strict `WITH CHECK` rejects the new tenantId |
| 6 | UPDATE under `app_user`: own row → foreign tenant | `WITH CHECK (own)` rejects reassignment |
| 7 | SELECT under `postgres` | Superuser bypass admits all rows |

Manual operator sanity:

```sql
-- Verify the policies + FORCE flag exist.
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE tablename = 'UserSession';

SELECT relname, relforcerowsecurity FROM pg_class
WHERE relname = 'UserSession';

-- Quick app_user smoke (use a real tenant id from your DB).
SET LOCAL ROLE app_user;
SELECT set_config('app.tenant_id', '<real-tenant-id>', true);
SELECT count(*) FROM "UserSession";       -- own + NULL only
INSERT INTO "UserSession"("id","sessionId","userId","tenantId","expiresAt")
VALUES ('x','x','<real-user-id>','<other-tenant-id>', now() + interval '1 hour');
-- Expect: ERROR: new row violates row-level security policy
RESET ROLE;
```

### V.2 — Sanitisation before storage (D.2)

```bash
npx jest tests/unit/security/sanitize-write-paths.test.ts --no-coverage
```

20 cases across 14 describe blocks — one positive XSS-strip per
sanitised call site. Plus the static guardrail's ratchet:

```bash
npx jest tests/guardrails/sanitize-rich-text-coverage.test.ts --no-coverage
```

`SANITISER_COVERAGE_FLOOR = 8` will fail loudly if the list ever
shrinks below 8 entries.

Manual operator sanity (against a running dev API):

```bash
# Plant XSS into a Finding via the API.
curl -X POST https://app.example.com/api/t/<slug>/findings \
  -H 'cookie: ...' -H 'content-type: application/json' \
  -d '{"severity":"HIGH","type":"NONCONFORMITY","title":"T",
       "description":"<script>alert(1)</script>",
       "rootCause":"<img src=x onerror=alert(2)>"}'

# Read the row directly.
psql ... -c 'SELECT description, "rootCause" FROM "Finding"
             ORDER BY "createdAt" DESC LIMIT 1;'
```

Expected: both fields contain only the literal text — no `<script>`,
no `onerror`. Repeat for Risk (`treatmentNotes`, `threat`,
`vulnerability`), Vendor (`description`, `notes`), Audit
(`auditScope`, `criteria`, `auditors`), and ControlTestRun (`notes`,
`findingSummary`).

### V.3 — Migrated-route audit on denial (D.3)

```bash
npx jest tests/unit/security/migrated-route-enforcement.test.ts --no-coverage
```

10 cases — one ADMIN-success + one READER-403-with-audit per
migrated cluster. Each denial test asserts the audit row's
`entityId` matches the rule's permission key.

```bash
# Manual: probe a migrated route as a READER.
curl -i -X GET https://app.example.com/api/t/<slug>/billing/events \
     -H "cookie: next-auth.session-token=<reader cookie>"

# Expected: HTTP/2 403, body {"error":{"code":"FORBIDDEN", ...}}
# Then check the audit table:
SELECT entity, "entityId", action, "detailsJson"
FROM "AuditLog"
WHERE action = 'AUTHZ_DENIED'
ORDER BY "createdAt" DESC LIMIT 1;
-- Expected: entity='Permission', entityId='admin.manage'
```

Before D.3: this same probe returned 403 but wrote nothing to
`AuditLog`. The audit row is the new property the migration
guarantees.

### V.4 — `grep` says zero legacy guards anywhere in `src/`

```bash
grep -rln "requireAdminCtx\|requireWriteCtx\|requireRoleCtx" src/
```

Must return no output — the legacy helpers and their defining module
(`src/lib/auth/require-admin.ts`) were removed on 2026-05-21.
`requirePermission` is the only admin-authorization guard. The
ratchet `tests/guardrails/no-legacy-admin-guard.test.ts` enforces
this on every CI run.

## Failure modes (by design)

| Layer | Degradation | Why |
|---|---|---|
| D.1 | If a future RLS policy edit accidentally drops `WITH CHECK` from `UserSession.tenant_isolation`, the post-loop guardrail check fires with the migration name + the qual/with_check values shown. | Catches the asymmetric-shape regression before merge. |
| D.2 | If a future PR removes a `sanitizePlainText` call from a covered usecase, the per-file dangling-import check (`tests/guardrails/sanitize-rich-text-coverage.test.ts`) trips. If a usecase file is deleted entirely, the stale-path check trips. If the list shrinks below 8, the floor trips. | Three independent checks; a regression hits at least one. |
| D.3 | A privileged route that drops `requirePermission` trips `api-permission-coverage.test.ts` ("Privileged route is missing API-layer permission enforcement"). Reintroducing the deleted `requireAdminCtx` helper trips `no-legacy-admin-guard.test.ts`. | Two ratchets — covered routes can only ever use `requirePermission`. |

## Rollback procedure

Use only in a genuine incident.

### D.1 — `UserSession` RLS

The policies are additive — disabling them does not destroy data
but exposes UserSession reads/writes to `app_user` cross-tenant.
**Don't disable in production unless the incident is genuinely
blocked by RLS itself.**

```sql
-- LAST RESORT — drops cross-tenant isolation on UserSession.
ALTER TABLE "UserSession" DISABLE ROW LEVEL SECURITY;
-- Re-enable + re-run the migration when the incident clears:
ALTER TABLE "UserSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSession" FORCE ROW LEVEL SECURITY;
-- (The migration's CREATE POLICY blocks are idempotent via
-- DROP POLICY IF EXISTS.)
```

### D.2 — Sanitisation

Sanitisation is purely a write-path transformation; rolling back
means deleting the call site (allowing raw input through). There is
no operator action — sanitisation never fails the request, so a
broken sanitiser cannot block business operations.

### D.3 — Migrated routes

`requirePermission` is the only admin guard — the legacy
`requireAdminCtx` swap-back is no longer available (the helper was
deleted 2026-05-21). To roll back a route, `git revert` the commit
that introduced its `requirePermission` wrapping. Never drop to
unguarded `getTenantCtx`, which removes the role check entirely.

## Remaining non-blocking caveats

1. **`UserSession` reads currently bypass RLS in production.** The
   `recordNewSession` insert path, the admin-sessions GET, and the
   `verifyAndTouchSession` lookup all use the global Prisma client
   (no `runInTenantContext`) — so they run as `postgres` and hit
   `superuser_bypass`. This is by design (the application-layer
   `requirePermission('admin.members')` + the explicit
   `row.tenantId === ctx.tenantId` recheck in the DELETE handler is
   the active control). RLS is the backstop — if a future caller
   accidentally routes a UserSession query through
   `runInTenantContext`, RLS will catch it.

2. **`sanitizePolicyContent('MARKDOWN', …)` plain-text-strips, not
   markdown-aware.** Embedded raw HTML inside a markdown blob is
   stripped, but legitimate markdown-only constructs (`# Heading`,
   `**bold**`) survive because the sanitiser only strips HTML tags.
   If the product later adopts a markdown library that supports
   embedded raw HTML, the policy loaders may need an explicit
   markdown sanitiser pass.

3. **The 8-file sanitiser floor will need bumping** as new
   rich-text usecases land. The floor is documented in the
   guardrail with a multi-line `History` comment; bumping it is one
   line change + a one-line comment per addition. Reviewers should
   refuse PRs that grow the file list without bumping the floor.

4. **Five self-service security routes are listed in
   `EXCLUDED_ROUTES`.** Each has a written `reason`. Adding a new
   self-service route requires either (a) wrapping it with
   `requirePermission` (preferred — even a self-only check is
   audit-visible) or (b) adding a new `EXCLUDED_ROUTES` entry with
   a written reason. The exclusion list itself is part of the
   review surface.

5. **`requireAdminCtx` removed (2026-05-21).** This caveat is
   resolved. The legacy role-tier helpers had no production call
   sites — every route, tenant-scoped and otherwise, already used
   `requirePermission` — so `src/lib/auth/require-admin.ts` was
   deleted. The non-tenant `/api/admin/*` routes are gated by the
   platform-admin API key, not by the legacy helper. The ratchet
   `tests/guardrails/no-legacy-admin-guard.test.ts` keeps the helper
   from returning.
