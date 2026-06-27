# 2026-06-27 — ORG_THREAT_LEVEL dashboard widget

**Commit:** `<pending>` feat(org-dashboard): ORG_THREAT_LEVEL widget

## What

A new widget type in the Epic 41 org-dashboard widget engine: a
**human-curated, org-wide threat-posture banner**. Every other org widget
is a *derived* metric (coverage, critical-risk counts, tenant health);
this is the first *curated situational signal* — an org security lead who
knows "an active threat affects our whole estate" can now broadcast it
across the portfolio dashboard.

**Credit:** the concept is ported from Cybether
(github.com/jccyberx/Cybether, **MIT**) — its manually-set "Threat Level"
indicator. Only the *idea* was ported; none of its code
(Flask/Chart.js/single-tenant). This is a native reimplementation on the
Next/Prisma/widget-engine stack.

## Scope decision: ORG-WIDE-SINGLE

One org → one current posture, set by an org admin, shown to everyone
viewing the org dashboard. The heavier alternative — a per-tenant threat
level with a portfolio rollup — was considered and **rejected**: it
doesn't match the "one curated signal" intent or the single-banner widget
framing. A per-tenant equivalent (and a tenant-dashboard widget) is a
separate effort.

## Naming resolution (premise fix)

The prompt specified BOTH `enum OrgThreatLevel` and `model OrgThreatLevel`
— Prisma forbids an enum and a model sharing a name. The **enum is
`OrgThreatTier`** (`GUARDED | LOW | ELEVATED | HIGH | SEVERE`); the
**model is `OrgThreatLevel`**. The widget type is `ORG_THREAT_LEVEL`, the
audit action `ORG_THREAT_LEVEL_SET`.

## Data model — org-scoped, no RLS / no tenant-DEK

`OrgThreatLevel` is ORG-scoped (`organizationId`, global prisma, NOT in
`TENANT_SCOPED_MODELS`), matching the other `org-*` models
(`OrgDashboardWidget`, `OrgAuditLog`) — only `Organization`/`OrgMembership`
are in `ORG_SCOPED_MODELS`, so it carries **no per-tenant RLS and no
Epic-B tenant-DEK** (that machinery is tenant-keyed). The curated
`summary`/`detail` are org-internal free text, **sanitised at the usecase
layer** (`sanitizePlainText`) — the protection model of the org models,
not the tenant-DEK. Rows are append-only history; current = most recent by
`setAt`. `setByUserId` is a plain String (no User FK) to keep the log
independent of user-lifecycle cascades; the display name is resolved in
the usecase.

## The set action is substantive → it audits

Unlike widget *config* (no audit), setting the posture is a substantive
security action. `setOrgThreatLevel` is gated on a **new, narrower
permission** `canSetThreatLevel` (ORG_ADMIN) — broadcasting a curated
signal is more privileged than moving a widget, so it gets its own flag
even though both map to ORG_ADMIN in v1 — and emits a new
`ORG_THREAT_LEVEL_SET` `OrgAuditAction` via `appendOrgAuditEntry`
(required by the org-audit-coverage guardrail).

## Staleness-provenance pattern

Curated signals go stale. The widget shows "set N days ago by <user>",
and a posture older than **30 days** renders a muted "may be stale" note.
Escalating colour is the **one deliberate alert-tone exception**:
GUARDED/LOW quiet, ELEVATED warning, HIGH/SEVERE error-toned with a
tinted banner surface.

## Files

| File | Role |
|------|------|
| `prisma/schema/enums.prisma` | `OrgThreatTier` enum + `ORG_THREAT_LEVEL` widget type + `ORG_THREAT_LEVEL_SET` audit action |
| `prisma/schema/auth.prisma` | `OrgThreatLevel` model + Organization back-relation |
| `prisma/migrations/20260627130000_org_threat_level/` | enums + table + index + FK |
| `src/lib/permissions.ts` | `canSetThreatLevel` flag (ORG_ADMIN) |
| `src/app-layer/schemas/org-dashboard-widget.schemas.ts` | ORG_THREAT_LEVEL Zod variant |
| `src/app-layer/usecases/org-threat-level.ts` | get-current / set (audited) / history |
| `src/app/api/org/[orgSlug]/threat-level/**` | GET current · PUT set · GET history |
| `src/app/org/[orgSlug]/(app)/OrgThreatLevelWidget.tsx` | banner + legend + staleness + Update Modal + history Sheet |
| `src/app/org/[orgSlug]/(app)/widget-dispatcher.tsx` + `page.tsx` | dispatch case + threat data on `PortfolioData` |
| `src/app-layer/usecases/org-dashboard-presets.ts` | widget seeded at top (y:0, full width); others shifted down |
| `tests/guardrails/org-threat-level-widget.test.ts` | structural ratchet |

## What this is NOT

- Not an automated threat feed — human-curated only.
- Not per-tenant threat levels (org-wide-single, per the scope decision).
- Not a tenant-dashboard widget (this is org-level).
- **Not yet addable via the WidgetPicker** — it's preset-seeded at the top
  and the API/Zod accept it, but the add-picker catalogue isn't extended
  (no guardrail requires it). Re-adding after deletion is a small
  follow-up.
