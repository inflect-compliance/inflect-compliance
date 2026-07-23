# 2026-07-21 — DSAR manual-fulfilment register

**Commit:** `<pending>` feat(admin): DSAR manual-fulfilment register

## Design

An admin register at `/admin/dsar-requests` for GDPR Art. 15 (access) and
Art. 17 (erasure) requests. It **records and tracks**; it does not fulfil.

This was chosen deliberately over building the export/erasure pipeline
(`docs/dsar.md` Stage 2/3). The full build is weeks of work, and Stage 3
modifies the `IMMUTABLE_AUDIT_LOG` trigger and runs an irreversible cascade.
A register gives a DPO a defensible log now, without irreversible machinery
and without claiming a capability the platform lacks.

`jobs/dsar-export.ts` and `dsar-erasure.ts` remain unregistered and still
throw. Nothing in this change exports or erases anything, and `exportUrl` is
never written — asserted in the integration test so a future export path
cannot land silently.

### The tenant-scoping hazard (the load-bearing part)

`DataSubjectRequest` has no `tenantId` by design — a DSAR is user-scoped and
spans every tenant the subject belongs to. The consequence is severe:

- The model is on **neither** isolation axis: not in `TENANT_SCOPED_MODELS`
  (no `tenantId`), not in `ORG_SCOPED_MODELS`. **No `tenant_isolation` RLS
  policy exists for the table.**
- `runInTenantContext` still sets `app.tenant_id`, but no policy consults it
  here. The wrapper buys transaction scoping and audit-context plumbing —
  not isolation.
- **No guardrail covers it.** `rls-coverage`, `tenant-isolation-*` and the
  forward-lock all iterate tenant-scoped models, so this table is invisible
  to them.

So `scopedToTenantMembers()` is the *only* thing preventing a tenant admin
from reading every rights request on the platform, and a `findMany` that
drops it returns other tenants' rows **with CI green**. The predicate rides
on the read inside `transitionDsarRequest` too — otherwise a guessed id would
be mutable. `tests/integration/dsar-register-isolation.test.ts` is the
compensating control for the absent DB backstop, and is the reason that file
exists at all.

Membership scoping is `status: 'ACTIVE'` only — deliberately stricter than
`resolveTenantContext`, which tolerates `INVITED` for request-gating. Someone
who never accepted, or who has left, should not have their rights request
visible to that tenant's staff.

### Honesty flags, split rather than flipped

`privacy-posture` pinned `dsar.intakeEnabled: false` with a unit test, so the
capability could not change silently. Building the register tripped that
tripwire — working as designed. The fix was **not** to flip the flag but to
split it:

| Flag | Value | Meaning |
| --- | --- | --- |
| `dsar.intakeEnabled` | `true` | Requests can be recorded and tracked |
| `dsar.automatedFulfilment` | `false` | Nothing exports or erases |

The privacy page renders these as two separate rows. One "DSAR: enabled" line
would imply a pipeline that does not exist.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/domain/dsar-status.ts` | Transition graph + pure checker (mirrors `work-item-status.ts`) |
| `src/app-layer/usecases/dsar-register.ts` | list / record / transition; carries the scoping predicate |
| `src/app/api/t/[tenantSlug]/admin/dsar-requests/route.ts` | GET/POST/PATCH, split view/manage gating |
| `src/app/t/[tenantSlug]/(app)/admin/dsar-requests/*` | Server page + client table |
| `src/lib/permissions.ts` | `admin.compliance_dsar_view` + `_manage` across all 5 roles |
| `src/lib/security/route-permissions.ts` | Two rules (GET vs POST/PATCH) |
| `src/lib/nav/{page-segregation,canonical-parents}.ts` | Subpage + back-affordance registration |
| `prisma/schema/{enums,auth}.prisma` + migration | `CANCELED` status, `handledById`, `fulfilmentNotes` |
| `src/app-layer/usecases/privacy-posture.ts` | Flag split |
| `tests/integration/dsar-register-isolation.test.ts` | Two-tenant compensating control |

## Decisions

- **`CANCELED` is a distinct terminal state, not a `REJECTED` variant.**
  "The subject withdrew" and "we refused" are different facts to a regulator.
  It is unreachable from `IN_PROGRESS`: once fulfilment has begun the honest
  endings are COMPLETED or REJECTED, and retro-cancelling performed work would
  misrepresent what happened.

- **`fulfilmentNotes` is sanitised but NOT encrypted**, against the
  house precedent (`AccessReviewDecision.notes` is encrypted). The precedent
  would be actively harmful here: the encryption middleware keys on the
  *acting request's* `tenantId`, but this model is cross-tenant. A note written
  by tenant A's admin would be encrypted under A's DEK, and tenant B's admin
  opening the same request would hit `decryptWithKeyOrPrevious`, which
  **throws** — the read would crash, not degrade. Recorded in the schema
  comment so it is not "fixed" later.

- **Provenance as columns, not audit-only.** `logEvent` writes to the *acting
  admin's* tenant audit log; for a cross-tenant record another tenant's admin
  would see no provenance at all. `handledById` + `fulfilmentNotes` live on the
  row, with audit entries *in addition* for the transition trail.

- **`handledById` exempted as `R_ACTOR`** in the index guardrail. The register
  is queried by status and by subject, never "every DSAR handled by admin X",
  and with no `tenantId` the `[tenantId, fk]` composite escape is unavailable.

- **AUDITOR holds `_view` but not `_manage`.** Reading the rights-request log
  is the auditor's job; advancing a request is a staff action with legal
  consequence. This made the existing test name *"AUDITOR has no admin
  permissions"* false, so it was renamed rather than left passing-but-lying.

- **Replica-mode teardown in the integration test.** The transitions write
  `AuditLog` rows, so deleting fixtures cascades into them and trips
  `IMMUTABLE_AUDIT_LOG`, failing the whole suite. Triggers are disabled for
  the cleanup transaction only — the trigger itself is untouched.

## Not built (deliberately)

Export bundle, erasure cascade, subject-facing intake, verification email, the
24h cooling-off enforcement, and the `IMMUTABLE_AUDIT_LOG` trigger change.
`docs/dsar.md` Stage 2/3/4 remain the plan of record if automated fulfilment
is ever wanted; `DSAR_COOLING_OFF_HOURS` and `evaluateDsarRejection` are
already in place for it.
