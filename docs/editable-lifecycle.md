# Editable Lifecycle — Draft/Publish Architecture

## Overview

The editable lifecycle provides a reusable draft/publish pattern for domain entities
that need clean separation between in-progress editing and published/live state,
with full version history for audit compliance.

```
DRAFT ──publish──▶ PUBLISHED ──archive──▶ ARCHIVED
  ▲                    │
  │              (snapshot to history)
  │                    │
  └──revert────── HISTORY[]
```

## Architecture Layers

```
src/app-layer/
├── domain/
│   └── editable-lifecycle.types.ts       # Core types (EditableState, PublishedSnapshot)
├── services/
│   ├── editable-lifecycle.ts             # Pure state machine (no side effects)
│   └── policy-lifecycle-adapter.ts       # Policy domain adapter
├── usecases/
│   └── editable-lifecycle-usecase.ts     # Auditable, persistence-aware workflow
└── policies/
    └── lifecycle.policies.ts             # Permission enforcement
```

### Layer Responsibilities

| Layer | File | Purpose |
|---|---|---|
| **Domain Types** | `editable-lifecycle.types.ts` | `EditableState<T>`, `PublishedSnapshot<T>`, `LifecycleError`, command types |
| **Pure Service** | `editable-lifecycle.ts` | State machine: `createEditableState`, `updateDraft`, `publish`, `revertToVersion`, `archive`. No DB, no audit, fully unit-testable. |
| **Usecase** | `editable-lifecycle-usecase.ts` | Orchestrates: load → validate → transition → persist → audit. Defines `EditableRepository<T>` contract. |
| **Policies** | `lifecycle.policies.ts` | `assertCanEditDraft`, `assertCanPublish`, `assertCanViewHistory`, `assertCanArchive`, `assertCanRevert` |
| **Domain Adapters** | `*-lifecycle-adapter.ts` | Maps between Prisma models and `EditableState<T>` for specific domains |

---

## Core Concepts

### EditableState\<TPayload\>

The central data structure that the lifecycle operates on:

```typescript
interface EditableState<TPayload> {
    phase: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    currentVersion: number;    // 1 = initial content, 2+ = published (matches CISO-Assistant)
    draft: TPayload | null;    // In-progress content (null if no pending changes)
    published: TPayload | null;  // Live/authoritative content (null if never published)
    publishedBy: string | null;  // Who published the current version (for correct history attribution)
    publishedChangeSummary: string | null;  // Summary from the current publish
    history: PublishedSnapshot<TPayload>[];  // Append-only, oldest-first
}
```

### TPayload (Domain-Specific)

Each domain defines its own payload type:

- **Policy**: `{ contentType, contentText, externalUrl, changeSummary }`

### Version Rules

| Rule | Behavior |
|---|---|
| Version starts at | 1 (initial content, matching CISO-Assistant `editing_version=1`) |
| Increments when | `publish()` is called — only then, never on draft edits |
| First publish | v1 → v2, no history entry (no prior state to snapshot) |
| Subsequent publish | v(N) → v(N+1), prior published state appended to history |
| `hasBeenPublished` | `currentVersion >= 2` |
| History | Append-only, ordered oldest-first, immutable |

### Persistence (CISO-Assistant Alignment)

Version and history are persisted using two dedicated schema columns:

| Column | Type | CISO-Assistant Equivalent | Description |
|---|---|---|---|
| `lifecycleVersion` | `Int @default(1)` | `editing_version` | Version counter, incremented only on publish |
| `lifecycleHistoryJson` | `Json?` | `editing_history` | Array of `PublishedSnapshot` entries |

These columns exist on the `Policy` model. (They also remain on
`VendorAssessment` from when it used this framework; that adapter has since been
retired — see below.)

**Backward compatibility**: Adapters prefer persisted columns when present,
falling back to legacy behavior for pre-migration data:
- `lifecycleVersion` → falls back to `PolicyVersion.versionNumber` (Policy) or derived from status (VA)
- `lifecycleHistoryJson` → falls back to reconstruction from `PolicyVersion` rows (Policy) or empty (VA)

---

## Permission Matrix

Actions are protected by the `lifecycle.policies.ts` module, following the
project's `assertCan*` pattern.

| Action | Permission | Roles | Rationale |
|---|---|---|---|
| **Edit draft** | `canWrite` | ADMIN, EDITOR | Creating/modifying draft content |
| **Publish** | `canAdmin` | ADMIN only | Making content authoritative across the org |
| **View history** | `canRead` + `canAudit` | ADMIN, AUDITOR | Historical state is part of audit trail |
| **Archive** | `canAdmin` | ADMIN only | Irreversible freeze operation |
| **Revert** | `canAdmin` | ADMIN only | Replaces draft with historical content |
| **View draft** | `canWrite` OR ownership | ADMIN, EDITOR, Owner | Draft entities hidden from non-owners |

Policies are enforced at **two levels** (defense-in-depth):

1. **Built-in** — The generic usecase functions (`publishWithAudit`, `updateDraftWithAudit`,
   `revertWithAudit`, `archiveWithAudit`) enforce policies automatically. Even if a
   caller forgets to check permissions, the usecase layer catches it.

2. **Domain-level** — Domain usecases can also call policies explicitly for clarity:

```typescript
export async function publishPolicy(ctx: RequestContext, policyId: string) {
    // Optional: assertCanPublish is also called inside publishWithAudit
    return runInTenantContext(ctx, async (db) => {
        return publishWithAudit(db, ctx, policyId, { publishedBy: ctx.userId }, repo, auditConfig);
    });
}
```

The `enforcePolicy: false` option is available for unit tests that need to bypass
policy checks when testing non-permission lifecycle behavior.

---

## Draft Visibility (CISO-Assistant `is_published` Convention)

Draft entities are **hidden from non-owners** following the CISO-Assistant
`is_published` flag convention on `AbstractBaseModel`.

### Visibility Rules

| Phase | Writers (ADMIN, EDITOR) | Owner (canRead) | Non-owner Reader |
|---|---|---|---|
| **DRAFT** | ✅ Visible | ✅ Visible | ❌ Hidden |
| **PUBLISHED** | ✅ Visible | ✅ Visible | ✅ Visible |
| **ARCHIVED** | ✅ Visible | ✅ Visible | ✅ Visible |

### Architecture

Three layers implement this convention:

| Layer | Function | Purpose |
|---|---|---|
| **Pure predicate** | `isDraftVisibleTo()` | Entity-level visibility check (no DB) |
| **Policy** | `assertCanViewDraftEntity()` | Single-entity access authorization |
| **Filter builder** | `buildDraftVisibilityFilter()` | Prisma where clause for list queries |

### Usage in List Queries

```typescript
import { buildDraftVisibilityFilter } from '@/app-layer/services/editable-lifecycle';

export async function listPolicies(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const visibilityFilter = buildDraftVisibilityFilter(
            ctx.permissions.canWrite, ctx.userId,
        );
        return db.policy.findMany({
            where: { tenantId: ctx.tenantId, ...visibilityFilter },
        });
    });
}
```

### Usage in Single-Entity Access

```typescript
import { assertCanViewDraftEntity } from '@/app-layer/policies/lifecycle.policies';

export async function getPolicy(ctx: RequestContext, policyId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const policy = await db.policy.findUnique({ where: { id: policyId } });
        assertCanViewDraftEntity(ctx, policyStatusToPhase(policy.status), policy.ownerUserId);
        return policy;
    });
}
```

---

## Adopted Domains

### Policy (Pilot)

| Aspect | Detail |
|---|---|
| **Adapter** | `policy-lifecycle-adapter.ts` |
| **Payload** | `PolicyPayload { contentType, contentText, externalUrl, changeSummary }` |
| **Phase mapping** | DRAFT/IN_REVIEW/APPROVED → DRAFT, PUBLISHED → PUBLISHED, ARCHIVED → ARCHIVED |
| **Validation** | MARKDOWN/HTML require contentText, EXTERNAL_LINK requires externalUrl |
| **Schema change** | None — maps to existing Policy + PolicyVersion Prisma models |
| **Audit prefix** | `POLICY_*` |

### VendorAssessment (retired from this framework)

VendorAssessment no longer uses the generic editable lifecycle. The
`vendor-assessment-lifecycle-adapter.ts` and its World-A phase mapping
(DRAFT/IN_REVIEW/APPROVED/REJECTED) were removed — VendorAssessment now runs on
its own dedicated **Epic G-3 lifecycle** (SENT → IN_PROGRESS → SUBMITTED →
REVIEWED → CLOSED), sent via `vendor-assessment-send.ts` and reviewed via
`vendor-assessment-review.ts`. The generic adapter was orphaned (imported only
by its own tests, built on the retired World-A statuses) and was deleted rather
than resurrected as a third parallel lifecycle.

### Deferred Domains

| Domain | Status Enum | Why Deferred |
|---|---|---|
| **Controls** | NOT_STARTED→IMPLEMENTED | Operational progress, not editorial content |
| **Risks** | OPEN→CLOSED | Risk lifecycle, not content versioning |
| **Audits** | PLANNED→COMPLETED | Process workflow, not draftable content |

These domains may adopt the lifecycle in the future if their workflow changes to
include editorial draft/publish semantics (e.g., "control playbooks" with draft/publish).

---

## Audit Trail

Every lifecycle transition emits an audit event via `logEvent()`:

| Event | Category | When |
|---|---|---|
| `{PREFIX}_DRAFT_UPDATED` | `entity_lifecycle` | Draft payload replaced |
| `{PREFIX}_PUBLISHED` | `status_change` | Draft promoted to live |
| `{PREFIX}_VERSION_CREATED` | `entity_lifecycle` | Prior state snapshotted (v2+) |
| `{PREFIX}_REVERTED` | `status_change` | Draft reverted to historical version |
| `{PREFIX}_ARCHIVED` | `status_change` | Entity frozen |

All events include:
- `userId` (who performed the action)
- `tenantId` (tenant context)
- `requestId` (request correlation)
- Version metadata (currentVersion, previousVersion, historyLength)

---

## Tenant Safety

1. **RLS enforcement** — All lifecycle operations run inside `runInTenantContext()`,
   which sets the PostgreSQL session variable for Row Level Security.
2. **Repository isolation** — `EditableRepository.loadState()` implementations filter
   by `tenantId` in every query.
3. **Audit attribution** — Every audit event is tagged with `tenantId` and `userId`
   from the verified `RequestContext`.

---

## Adding a New Domain

To adopt the lifecycle for a new domain:

### 1. Define the payload type

```typescript
interface ControlPlaybookPayload {
    description: string;
    implementationNotes: string;
    testProcedure: string;
}
```

### 2. Create a domain adapter

```typescript
// src/app-layer/services/control-playbook-lifecycle-adapter.ts
import type { EditableRepository } from '../usecases/editable-lifecycle-usecase';

export class ControlPlaybookAdapter implements EditableRepository<ControlPlaybookPayload> {
    async loadState(db, entityId) { /* map Prisma → EditableState */ }
    async saveState(db, entityId, state) { /* map EditableState → Prisma */ }
}
```

### 3. Add phase mapping

Map the domain's status enum to `EditablePhase` (DRAFT/PUBLISHED/ARCHIVED).

### 4. Add validation (optional)

```typescript
export const validatePlaybook: PublishValidator<ControlPlaybookPayload> = (draft) => {
    if (!draft.description) throw new Error('Description required before publish');
};
```

### 5. Wire up the domain usecase

```typescript
export async function publishPlaybook(ctx: RequestContext, controlId: string) {
    assertCanPublish(ctx);
    return runInTenantContext(ctx, (db) =>
        publishWithAudit(db, ctx, controlId, { publishedBy: ctx.userId }, adapter, auditConfig)
    );
}
```

### 6. Add tests

Cover: draft editing, publish, history integrity, permission denial, regression guards.
