# Prisma 5 → 7 migration — plan

**Status:** open. Targets dependabot PRs #127 (`prisma`) + #124
(`@prisma/client`). Both must ship together — Prisma's CLI and
client are paired releases.

**Why this is its own session:** Prisma 7 lands three breaking
changes that touch security-critical surfaces (Epic A.1 RLS, Epic
B field encryption, PII middleware). Bundling it into a routine
dep-queue PR risks silently weakening the multi-tenant isolation
or encryption-at-rest guarantees. The work below is sequenced so
each step is independently verifiable.

---

## Breaking changes that bite us

### 1. Connection URLs leave `schema.prisma`

Prisma 7 rejects `url` and `directUrl` on the `datasource`. Both
must move into a new `prisma.config.ts`:

```ts
// prisma.config.ts
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: path.join('prisma', 'schema'),
    migrations: {
        path: path.join('prisma', 'migrations'),
    },
    datasource: {
        url: process.env.DATABASE_URL!,
        directUrl: process.env.DIRECT_DATABASE_URL!,
    },
});
```

### 2. `PrismaClient` requires an adapter

The Prisma 7 client no longer connects directly. It requires an
adapter passed to the constructor. For Postgres:

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = new PrismaClient({ adapter });
```

Adds a new dep (`@prisma/adapter-pg`) and changes how
`src/lib/prisma.ts` instantiates the client.

### 3. `$use` middleware was removed

`prisma.$use((params, next) => {...})` was deprecated in v5,
removed in v6/v7. Replacement: `client.$extends({ query: { ... } })`.

The `query` extension API has a different signature — instead of a
single middleware that branches on `params.model` + `params.action`,
you write per-model + per-action handlers. Migration is mechanical
but verbose, and the security middleware needs careful preservation
of order.

---

## `$use` call sites in the repo (5 production + 6 tests)

Production:

| File | What it does | Risk class if broken |
|---|---|---|
| `src/lib/prisma.ts:93` | Audit-trail interception — populates the hash-chained `AuditLog` row on every write action. | High — silent loss of compliance evidence. |
| `src/lib/prisma.ts:225` | Wires `piiEncryptionMiddleware` so `User.email` etc. encrypt on write + decrypt on read via the `emailHash` column. | Critical — could write plaintext PII or block reads. |
| `src/lib/db/encryption-middleware.ts:464` | Epic B field-level encryption — encrypts manifest fields with the per-tenant DEK; v1→v2 envelope handling. | Critical — encryption-at-rest. |
| `src/lib/db/rls-middleware.ts:288` | Epic A.1 — sets `SET LOCAL ROLE app_user` + `app.tenant_id` GUC inside the Prisma `$transaction`. | Critical — multi-tenant isolation. |
| `src/lib/soft-delete.ts:66` | Transforms `delete` → `update { deletedAt }` for soft-delete-allowlisted models + filters reads. | Medium — could cause hard deletes or visible deleted rows. |

Tests (mock `$use` to swap middleware in for a single test):

- `tests/integration/pii-encryption.test.ts:20`
- `tests/integration/control-test-flow.test.ts:16`
- `tests/integration/epic8-regression-guards.test.ts:24`
- `tests/integration/soft-delete.test.ts:22`
- `tests/integration/data-lifecycle.test.ts:26`
- `tests/helpers/db.ts:95`
- `tests/unit/encryption-middleware.test.ts:406`
- `tests/unit/rls-middleware.test.ts:143`

Plus `tests/unit/encryption-middleware.test.ts:420` and
`tests/unit/rls-middleware.test.ts:158` assert `$use` was called.

---

## Recommended migration order

The order is safety-first: keep the order of middleware composition
identical to today's `prisma.ts`, and verify each layer's contract
before moving to the next.

### Step 1 — config + adapter wiring (mechanical)

Branch off main with both `prisma`@7 and `@prisma/client`@7 plus
`@prisma/adapter-pg`. No middleware changes yet; just swap the
client construction.

1. `npm install prisma@^7 @prisma/client@^7 @prisma/adapter-pg`
   (strict peer resolution — never `--legacy-peer-deps`; see
   `docs/dependency-policy.md`).
2. Create `prisma.config.ts` with the schema folder + datasource
   URLs from env.
3. Remove `url` + `directUrl` from `prisma/schema/base.prisma`'s
   `datasource db {}` block. Keep `provider = "postgresql"`.
4. Remove the `previewFeatures = ["prismaSchemaFolder"]` line in
   `base.prisma` — prismaSchemaFolder is GA in v6+.
5. Add `engineType = "library"` if needed (Prisma 7 still defaults
   to library; only change if the build complains).
6. Update `src/lib/prisma.ts`:
   ```ts
   const adapter = new PrismaPg({
       connectionString: env.DATABASE_URL,
   });
   const client = new PrismaClient({ adapter, log: [...] });
   ```
   Keep the existing logger config + soft-delete + PII middleware
   wiring inline — these still call `client.$use(...)` which won't
   compile under v7 client. **At this stage the client construction
   compiles but ALL `$use` calls fail to typecheck.**
7. Update `prisma/migrations/migration_lock.toml` if Prisma rewrites
   it on `prisma generate`.

**Verification:**
   - `npx prisma generate` succeeds (uses the new config).
   - `npx prisma migrate status` connects via the adapter.
   - Build still red because `$use` doesn't exist on v7 client.

### Step 2 — convert middleware to `$extends({ query })`

Each `$use` middleware becomes an `$extends({ query: { ... } })`
extension. The new shape:

```ts
client.$extends({
    name: 'pii-encryption',
    query: {
        $allModels: {
            async create({ args, query, model, operation }) {
                // pre-write logic (encrypt, etc.)
                args = encrypt(args);
                const result = await query(args);
                return decrypt(result);
            },
            async findUnique({ ... }) { ... },
            // ... per-action handler
        },
    },
});
```

Order matters — extensions compose left-to-right. The current
`$use` order is:
1. Soft-delete (`registerSoftDeleteMiddleware`)
2. PII encryption (`piiEncryptionMiddleware`)
3. Audit interception (anonymous in `prisma.ts:93`)

Plus separately:
- RLS middleware (`runInTenantContext` from `rls-middleware.ts`) —
  this fires per-transaction inside a `$transaction` block, NOT on
  the global client. Doesn't compose with the above; it gates the
  inner client returned by `$transaction`.
- Field-level encryption (`encryption-middleware.ts`) — also gated
  per-transaction since it needs the request's tenant DEK.

The migration MUST preserve this composition shape. Most critical:
the audit middleware writes the `AuditLog` row AFTER the underlying
write succeeds, while the encryption middleware encrypts BEFORE the
write. Reordering would either log unencrypted plaintext to the
audit chain or skip encryption.

**Per-middleware migration steps:**

A. Soft-delete (`src/lib/soft-delete.ts`)
   - Convert `client.$use((params, next) => {...})` to
     `client.$extends({ query: { $allModels: { delete, deleteMany,
     findUnique, findFirst, findMany } } })`.
   - The allowlist pattern (only soft-delete certain models) becomes
     a per-action guard on `model` inside each handler.
   - Reads need to filter `deletedAt: null` injected into `where`.
   - Returns the extended client; no in-place mutation any more.

B. PII encryption (`src/lib/security/pii-middleware.ts`)
   - The middleware encrypts `User.email` etc. before write and
     decrypts on read. Already uses a manifest pattern (file:
     `pii-middleware.ts`). The handler needs to map the v5 `params`
     model into the v7 `model` field — same logic.
   - Cleanup: drop the `prisma.$use(piiEncryptionMiddleware)` call
     in `prisma.ts:225` and instead chain the extension during
     client construction.

C. Audit middleware (`src/lib/prisma.ts:93`)
   - Wraps every WRITE_ACTIONS call to record the audit row after
     success. Convert to `$extends({ query: { $allModels: { create,
     update, delete, ... } } })` where each handler invokes `query()`
     then writes the audit log.
   - Preserve the `getAuditContext()` reads + `redactSensitiveFields`
     calls verbatim.

D. Field-level encryption (`src/lib/db/encryption-middleware.ts`)
   - The middleware reads the tenant DEK lazily via
     `getAuditContext()`. Same handler shape as PII; manifest-driven.
   - Critical: the middleware MUST run BEFORE writes hit the DB and
     AFTER reads return rows. Extensions compose in registration
     order, so this needs to be added EARLIER in the chain than
     audit (which needs to record post-write state).

E. RLS middleware (`src/lib/db/rls-middleware.ts`)
   - Different shape — fires inside `$transaction`. The `$use` call
     wraps the **inner transactional client** and emits a
     `SET LOCAL` SQL statement at the start of each query.
   - In Prisma 7, `$transaction` returns an extended client; the
     RLS extension applies inside the transaction callback the same
     way. Conversion is a `$extends({ query: { $allModels: {
     async $allOperations({ query, args }) { ... } } } })` block.

**Verification per middleware:**
   - Re-run the targeted test for each module before moving to the
     next: `tests/unit/encryption-middleware.test.ts`,
     `tests/unit/rls-middleware.test.ts`, plus the integration
     coverage in `tests/integration/pii-encryption.test.ts`,
     `soft-delete.test.ts`, `data-lifecycle.test.ts`,
     `epic8-regression-guards.test.ts`, `control-test-flow.test.ts`.
   - These need a live Postgres (port 5434 in dev / containerised
     in CI). Run them sequentially, not in parallel — they share the
     DB and we want to bisect any regressions cleanly.

### Step 3 — RLS guard + structural ratchets

CLAUDE.md's tenant isolation guard
(`tests/guardrails/rls-coverage.test.ts`) reads tables from the
DB schema and asserts every tenant-scoped table has the canonical
`tenant_isolation` + `superuser_bypass` policies. This test does
NOT use `$use` — but it does use `prismaTestClient()` which goes
through the migrated path, so verify it stays green.

`tests/unit/tenant-isolation-structural.test.ts` is a code-pattern
scanner that doesn't touch the DB; should be unaffected.

### Step 4 — `tests/helpers/db.ts` + integration test fixtures

Six integration test files call `prisma.$use(piiEncryptionMiddleware)`
on their imported client. After migration, the helper at
`tests/helpers/db.ts:95` must instead build the extended client
once and re-export it. The integration tests don't need to change
their import paths.

### Step 5 — TypeScript surface

Prisma 7 client exports the `Prisma` namespace + extended client
type. After all middleware moves to extensions, the **type** of
`prisma` in the rest of the app changes from `PrismaClient` to the
extended client type. Most app-layer code uses `prisma` for queries
that don't touch extension-specific shapes, so it should compile.
Watch for:

- Repositories that use `Prisma.TransactionClient` — still works.
- Generic helpers that pass a `PrismaClient` through — change to
  the extended type via `ReturnType<typeof buildPrisma>`.

### Step 6 — Schema generator

Prisma 7 introduced the new `prisma-client` generator (replacing
`prisma-client-js` for new projects). We're keeping
`prisma-client-js` since switching is out of scope; verify the
generator still emits to `node_modules/.prisma/client` cleanly.

---

## Pre-flight checklist

Before opening the PR:

- [ ] All 5 production middleware modules migrated to `$extends`.
- [ ] Composition order verified (encryption BEFORE audit; soft-delete
  BEFORE PII).
- [ ] All 6 integration tests updated through `tests/helpers/db.ts`.
- [ ] `tests/unit/encryption-middleware.test.ts` +
  `tests/unit/rls-middleware.test.ts` pass (these mock `$use`
  today — migrate to mocking `$extends`).
- [ ] Local DB — run the data-lifecycle integration test to confirm
  encrypt → write → decrypt → read round-trip across the new
  client.
- [ ] CI green on the dependabot PR — the existing CI gates
  (`tests/guardrails/rls-coverage.test.ts`,
  `tests/guardrails/encryption-key-enforcement.test.ts`) re-validate
  the security-critical paths.
- [ ] Manual smoke against staging tenant — create a control,
  read it back, confirm encryption envelope (`v2:` prefix on
  Risk.treatmentNotes).

---

## What CAN go wrong

| Risk | Mitigation |
|---|---|
| Audit log records plaintext (encryption extension applied AFTER audit). | Hard-test in integration: write a row with manifest field, decrypt the AuditLog row's `detailsJson`, assert it's the encrypted ciphertext, not plaintext. |
| RLS context not set on the extended transactional client. | The existing `tests/integration/rls-cooperation.test.ts` (if it exists; otherwise create) covers cross-tenant reads — run with two seeded tenants. |
| Soft-delete allowlist regression — a model that should soft-delete now hard-deletes. | The soft-delete integration test asserts every allowlisted model. Run after the migration. |
| Tests that mock `$use` directly fail because the API doesn't exist. | Update the mock to spy on `$extends` instead. |
| `tests/helpers/db.ts` shared singleton becomes stale across tests. | Each integration test imports `prismaTestClient()` — confirm the singleton is still re-built fresh per test file. |

---

## Estimated scope

- **Step 1** (config + adapter): 30-60 min.
- **Step 2** (5 middleware migrations): 2-4 hours, with one-test-at-
  a-time verification.
- **Step 3-6** (cleanup, guards, types): 1-2 hours.
- **Verification** (running the full test matrix incl. integration):
  30 min on a CI runner, ~15 min locally with Postgres.

Total: a focused half-day session with active CI feedback. Not a
queue-clearing exercise.

---

## What stays open after this is done

- `tests/e2e/risk-matrix-admin.spec.ts:30` — flaky live-rendering
  loop settle race (skipped earlier today, unrelated).
- `tests/e2e/tooltip-and-copy.spec.ts:88` — audit-pack share link,
  billing-gate seed issue (skipped earlier today, unrelated).
- The `vaul` jsdom mock from #125 — re-evaluate when vaul ships a
  React 19 fix or Modal moves off vaul.
- Next 16's `await params` migration warning — bounded follow-up;
  Next 17 will require it.
- Middleware → proxy file convention rename — bounded follow-up.
