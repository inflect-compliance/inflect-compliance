# 2026-07-01 — Business Impact Analysis (continuity) under Internal Audit

**Commit:** `<pending> feat(continuity): BIA under Internal Audit — wired to processes + related controls`

## Why / provenance

IC seeds the NIS2 Art.21(2)(c) business-continuity requirement but had **no
operational capability** to satisfy it — no BIA, no RTO/RPO/MTPD. This adds
that capability, **clean-room from the recognised methodology** (ISO 22301,
NIS2 Art.21(2)(c), DORA operational resilience). It was **not** derived from
nis2-public's BIA code — that project is **AGPL-3.0**, which would infect IC;
only the public standards/methodology were used.

## Placement (the locked IA decision)

BIA lives **inside the Internal Audit area, beside Incidents** — the two are
sibling operational-resilience obligations (NIS2/DORA pair incident handling
with business continuity). It is a **"Business Continuity" pill** in the
`AuditsClient` `PageHeader` (next to the Incidents pill), routed at
`/audits/business-continuity` (+ `/[id]`). NOT a standalone `/bia` nav item,
NOT a tab inside the Processes canvas.

## Design — the three wiring points (all DERIVED, no dead surfaces)

**Process.** A BIA attaches to a `ProcessNode` (`processNodeId`). The BIA lives
in the audit area, not the canvas — the canvas *links* to it (`ProcessNode`
carries the `businessImpactAnalyses` back-relation; `getBiasForProcessNode`
serves the cross-link).

**Control — conditional (`getControlBiaSurface`), the no-dead-tab lock.** A
control gets a BIA surface via exactly one of:
- **(a) continuity** — the control satisfies Art.21(2)(c)/ISO 22301 (a
  `ControlRequirementLink` to a continuity requirement) → its linked BIAs
  render as **evidence** in a Business Continuity section.
- **(b) process** — the control protects a process that HAS a BIA
  (`control → ProcessEdgeControl → ProcessEdge → ProcessNode → BIA`, all
  derived, no new FK) → a one-line **impact chip** ("Protects Payment
  Processing — MTPD 4h · recovery #2").
- **(c) none** — render nothing.

The integration test asserts (a) and (c) against a real DB; the ratchet locks
that the resolver only ever returns these three kinds and that continuity is
gated on a requirement link (never unconditional).

**Incident.** `Incident` has no direct process ref, so recovery-deadline
context is **derived** via the incident's `linkedControlIds`
(`control → process → BIA`), tightest-MTPD first — the co-location payoff that
makes the BIA actionable during a live incident.

**Recovery priority** — a transparent, documented ordering (criticality →
MTPD asc → RTO asc → id), unit-tested. Explicitly NOT a black-box continuity
score.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `BusinessImpactAnalysis` + `BiaDependency`; `ControlEvidenceLink.biaId` |
| `prisma/schema/enums.prisma` | `EvidenceLinkKind.BIA` |
| `prisma/schema/processes.prisma` | `ProcessNode.businessImpactAnalyses` back-relation (canvas cross-link) |
| `prisma/migrations/20260701130000_bia_module/` | tables + FKs + RLS + the `biaId` alter + enum add |
| `src/lib/security/encrypted-fields.ts` | `BusinessImpactAnalysis.notes` encrypted |
| `src/app-layer/services/bia-recovery-priority.ts` | transparent recovery-priority derivation (pure) |
| `src/app-layer/usecases/business-impact-analysis.ts` | CRUD + list/detail + `getControlBiaSurface` + incident context + evidence link |
| `src/app/api/t/[tenantSlug]/business-continuity/**` | register/detail/link-control routes |
| `src/app/api/t/[tenantSlug]/controls/[controlId]/bia-surface/route.ts` | conditional control surface |
| `src/app/api/t/[tenantSlug]/incidents/[incidentId]/bia-context/route.ts` | incident recovery context |
| `tests/guardrails/bia-coverage.test.ts` | structural ratchet |

## Decisions

- **BIA-as-evidence via a real `biaId` on `ControlEvidenceLink` + a `BIA`
  kind** (not a soft URL link), so the Art.21(2)(c) framework satisfaction is
  a real, traceable link.
- **No proprietary continuity score** — recovery priority is a transparent
  ordering; the ratchet fails CI if an opaque score is introduced.
- **Process case reuses the edge-mounted control model** (`ProcessEdgeControl`)
  — controls attach to process *edges* in IC, so the derivation walks
  edge→node→BIA rather than inventing a control→process FK.

## Follow-up (PR-2, UI)

The `/audits/business-continuity` register + detail pages (recovery-priority
view, impact-over-time chart, dependencies, linked controls/risks/incidents),
the AuditsClient "Business Continuity" pill, the process-canvas "View/Add BIA"
cross-link, the control-detail section/chip rendering, and the incident MTPD
surface. The API + data layer + derivations ship here; the ratchet extends
with the UI-placement assertions.
