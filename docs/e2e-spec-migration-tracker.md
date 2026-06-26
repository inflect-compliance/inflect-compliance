# Playwright spec → isolated-tenant migration tracker

> **Status: living design** — describes a direction that is partially shipped. See the "Current state" and "Roadmap" sections for what is and isn't true today.

> **Purpose.** Track which `tests/e2e/*.spec.ts` files use the GAP-23
> `createIsolatedTenant()` factory vs. the seeded `acme-corp` fixture
> tenant. Adopt incrementally as specs are reworked.

## State key

| State | Meaning |
|---|---|
| ✅ migrated | Uses `createIsolatedTenant()` per describe block; no shared-seed dependency. |
| 🟡 partial | Some tests in the file use the factory; others retain a shared-seed dependency with a written reason. |
| 🔒 deferred | Not yet migrated — listed below with the specific blocker. |

## Current state (true today)

### Status

| Spec | State | Notes |
|---|---|---|
| `e2e-utils-isolation.spec.ts` | ✅ | Self-test for the factory itself. |
| `theme-toggle.spec.ts` | ✅ | Single test; only needs dashboard render. |
| `responsive.spec.ts` | ✅ | Two describes (mobile + desktop); each gets its own tenant. |
| `onboarding.spec.ts` | 🟡 | Admin tests migrated. The "non-admin cannot access" test still uses seeded `viewer@acme.com`; gated on the factory gaining a multi-role provisioner. |
| `frameworks.spec.ts` | 🔒 | Asserts ISO27001/SOC2/NIS2/ISO9001/ISO28000/ISO39001 cards exist — those are installed on the seeded tenant. Gated on factory option to install frameworks. |
| `controls.spec.ts` | 🔒 | Asserts on a populated controls table. Gated on a controls-seeding helper. |
| `controls-enhanced.spec.ts` | 🔒 | Same — controls-table population needed. |
| `controls-filter-epic53.spec.ts` | 🔒 | Same. |
| `control-tests.spec.ts` | 🔒 | Asserts on test-plan/test-run rows. Needs control + plan seeding. |
| `control-edit-modal.spec.ts` | 🔒 | Asserts on the edit-modal opened from a populated controls table. |
| `control-evidence.spec.ts` | 🔒 | Asserts on linked evidence rows. |
| `control-toggle-pills.spec.ts` | 🔒 | Same — populated table required. |
| `create-control-modal.spec.ts` | 🔒 | The CREATE flow itself works on an empty tenant, but the post-create assertions look for the row to appear in the existing seeded list. |
| `evidence-upload-modal.spec.ts` | 🔒 | Needs a control to attach evidence to. |
| `new-risk-modal.spec.ts` | 🔒 | The wizard creates a risk; the post-wizard view asserts the risk lands in the populated table. |
| `core-flow.spec.ts` | 🔒 | The full A→E lifecycle test; depends on starting state with at least one control. |
| `data-table-platform.spec.ts` | 🔒 | Asserts on a populated table for sort/filter/pagination behaviour. |
| `epic54-crud-smoke.spec.ts` | 🔒 | Multiple resource CRUDs; depends on seeded shape. |
| `filters.spec.ts` | 🔒 | Filter coverage requires populated rows. |
| `policies.spec.ts` | 🔒 | Asserts on policy rows. |
| `vendors.spec.ts` | 🔒 | Asserts on vendor rows. |
| `audit-readiness.spec.ts` | 🔒 | Requires audit cycle + pack rows. |
| `tooltip-and-copy.spec.ts` | 🔒 | Selects a row in the controls DataTable. |
| `reporting.spec.ts` | 🔒 | Reports require populated entities. |
| `issues.spec.ts` | 🔒 | Issue list assumes seeded controls/findings. |
| `ai-risk-assessment.spec.ts` | 🔒 | Wizard flow needs preconditions in the tenant. |
| `a11y.spec.ts` | 🔒 | Multi-page sweep; populated tables needed for some pages. |
| `ciso-portfolio.spec.ts` | 🔒 | Cross-tenant ORG view; requires the seeded organization layer. |
| `admin-members.spec.ts` | 🔒 | Multi-user (admin + reader); needs multi-role provisioner. |
| `admin-regression.spec.ts` | 🔒 | Same — multi-role coverage. |
| `admin-sso.spec.ts` | 🔒 | Multi-role coverage + SSO config seed. |
| `auth.spec.ts` | 🔒 | Login flow against the canonical seeded user; isolated tenant would defeat the purpose. |
| `credentials-hardening.spec.ts` | 🔒 | Brute-force protection tests against seeded credentials. |
| `invite-flow.spec.ts` | 🔒 | Tests the invite redemption flow itself; multi-user. |
| `rbac-access.spec.ts` | 🔒 | Multi-role RBAC matrix. |

## Roadmap (future direction)

### What unblocks each cluster

### "Empty tenant" blockers (most 🔒 above)

The factory currently creates a tenant with **only an OWNER user** and
no compliance entities. To migrate specs that assert on populated
data, we need either:

1. **Optional fixture installation in the factory:**
   ```ts
   await createIsolatedTenant({
       request,
       installFrameworks: ['ISO27001'],
       seedControls: 5,
       seedRisks: 3,
   });
   ```
   Calls the same usecases the production "install framework" /
   bulk-import flows use. Realistic, but each option adds a
   round-trip to setup time.

2. **Per-spec helper that calls usecases directly via the
   `createTenantWithOwner` test harness path** (already exists
   under platform-admin auth) and seeds via Prisma. Faster but
   couples specs to schema.

The first option is more consistent with the GAP-23 mandate (use
real product flows) and is the recommended path.

### "Multi-role" blockers (admin-members, rbac-access, invite-flow, …)

The factory only provisions an OWNER. Tests that need ADMIN +
EDITOR + READER + AUDITOR within the same tenant need a
companion helper:

```ts
const tenant = await createIsolatedTenant({ request });
const reader = await addTenantUser(tenant, {
    role: 'READER',
    namePrefix: 'rdr',
});
```

Implementation: invite the user via the admin-invites API +
auto-redeem in the same call. Realistic, exercises the real
membership flow, ~2 round-trips.

### "Auth-flow" blockers (auth, credentials-hardening)

These are SUPPOSED to run against the canonical seeded user — they
test the credentials provider's behaviour itself. Migration would
defeat the purpose. They stay on the seed by design.

### Adoption order recommended for follow-up PRs

1. **Add `installFrameworks` to the factory.** Unblocks 9–11 specs at
   once (frameworks, controls family, audit-readiness, reporting).
2. **Add `addTenantUser` helper.** Unblocks the multi-role cluster
   (admin-members, rbac-access, invite-flow, admin-sso, …).
3. **Sweep the remaining specs** as their preconditions become
   available.

### Why the auth flow is still single-tenant

Both `auth.spec.ts` and `credentials-hardening.spec.ts` assert on
specific behaviours of the credentials login path: account-locking
under brute force, MissingCSRF retry shape, the "verification
required" gate. These behaviours are defined against the canonical
seeded user, not against test data. Migrating them to the factory
would only paper over the underlying coupling — operators care that
THIS specific account behaves correctly, not that some random new
account does.
