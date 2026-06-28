# 2026-06-29 — Incident containment runbooks + forensic evidence linking

**Commit:** `<pending> feat(incidents): containment runbooks + forensic evidence linking`

## Attribution

The per-incident-type **containment methodology** (the first-response
step structure), the **six incident-response roles**, and the
**forensic evidence collection** categories are adapted (**CC BY 4.0**)
from [`Kshreenath/NIS2-Checklist`](https://github.com/Kshreenath/NIS2-Checklist)
(© **Paolo Carner / BARE Consulting**). The source's SMB-/Belgium-
specific playbook *prose* was NOT copied — the steps are rewritten
generically. NOT legal advice.

## Scope note

This is P2 + P3 of the optional "GDPR crosswalk + runbooks" prompt.
**P1 (the GDPR↔NIS2 crosswalk) was dropped** after investigation: the
prompt assumed the YAML `RequirementMappingSet` crosswalk surfaces in
an existing view, but that data is persisted and **never displayed** —
the visible `/mapping` page uses a separate hardcoded SOC2/NIS2
mechanism. There was no existing generic crosswalk surface to "just add
GDPR data" to, so P1 was deferred rather than build a new surface the
prompt explicitly forbade. P2 (containment runbooks) and P3 (forensic
linking) layer cleanly on the existing Incident model and shipped here.

## Design

Two pieces of reference content + machinery layered on the Incident
model (from the NIS2 Article 23 PR, #1308):

- **Containment runbooks (P2).** `src/data/incident-containment.ts`
  holds a per-`incidentType` containment checklist (RANSOMWARE /
  DATA_BREACH / DDOS / UNAUTHORIZED_ACCESS), each step carrying a stable
  type-prefixed key (`RANSOMWARE-1`). The incident detail page renders
  the runbook matching the incident's type; each step is a checkbox.
  Checking a step persists to `Incident.completedContainmentSteps`
  (the checkbox state) **and** appends an `IncidentTimelineEntry` — so
  the response narrative captures containment progress. The six-role
  IR RACI renders as informational reference (not enforced).

- **Forensic evidence linking (P3).** A new `IncidentEvidence` junction
  (mirroring `FindingEvidence` — two composite `(id, tenantId)` parent
  FKs, RLS Class-A, indexed) lets an incident link real `Evidence`
  records. `IncidentEvidence.forensicCategory` tags which checklist
  category (system logs / memory / network / disk / IOCs / timeline)
  the evidence satisfies. The detail page shows the forensic checklist
  with per-category linked counts + a picker to link tenant Evidence.

## Files

| File | Role |
|------|------|
| `src/data/incident-containment.ts` | Reference data: runbooks + IR RACI + forensic categories (credited) |
| `prisma/schema/compliance.prisma` | `Incident.completedContainmentSteps` + `IncidentEvidence` junction |
| `prisma/migrations/20260629120000_incident_containment_forensics/` | column + junction + indexes + RLS |
| `src/app-layer/schemas/incident.schemas.ts` | `ToggleContainmentStep` + `LinkEvidence` schemas |
| `src/app-layer/repositories/IncidentRepository.ts` | evidence link/unlink + getById includes evidence |
| `src/app-layer/usecases/incident.ts` | `toggleContainmentStep` / `linkEvidence` / `unlinkEvidence` (audited) |
| `src/app/api/t/[tenantSlug]/incidents/[incidentId]/containment-step/route.ts` | toggle step (manage) |
| `src/app/api/t/[tenantSlug]/incidents/[incidentId]/evidence/route.ts` | link / unlink evidence (manage) |
| `src/app/t/[tenantSlug]/(app)/incidents/[incidentId]/page.tsx` | runbook + forensic checklist + RACI UI |
| `tests/guardrails/incident-containment-forensic-coverage.test.ts` | structural ratchet |
| `tests/integration/incident-containment-forensics.test.ts` | end-to-end lifecycle |

## Decisions

- **Containment steps persist as a string array, not a new table.**
  `completedContainmentSteps String[]` is the minimal state; the
  authoritative narrative is the timeline entry written on completion.
  Stable per-step keys (`<TYPE>-<n>`) mean label edits don't reset
  completion.
- **IncidentEvidence reuses the FindingEvidence shape exactly** —
  composite parent FKs guarantee tenant-consistency at the DB layer,
  RLS + indexes mirror the proven junction. The link usecase also
  validates the evidence belongs to the tenant before creating the row.
- **Reference content, not enforcement.** The runbook, RACI, and
  forensic checklist are operational aids; nothing is gated on them.
  The "not legal advice" posture carries over from #1308.
