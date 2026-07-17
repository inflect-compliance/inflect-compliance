# 2026-07-18 — Acknowledgement campaign: survive revision + feed posture

**Commit:** `<pending> feat(policy): make acknowledgement survive revision + feed the library`

## Design

Acknowledgement was wired but a re-publish silently stranded the campaign, ack
completion fed no signal, the named-user audience was unreachable, and the
auditor "who attested" export was orphaned.

1. **Re-publish carry-forward.** `PolicyAcknowledgementAssignment` is
   version-scoped (`policyVersionId`, no `policyId`), so publishing a new
   version left the roster reading the fresh (empty) version at
   `assignedCount:0` while the prior campaign orphaned against the superseded
   version. `publishPolicy` now captures the outgoing version, copies its
   assignments onto the new version (assignments only — NOT acks: the revised
   policy needs FRESH acknowledgement), audits `POLICY_ACK_CARRIED_FORWARD`, and
   **re-notifies** the carried assignees post-commit (dedupeKey scoped to the
   new version). The roster distinguishes `ACKNOWLEDGED` (current) from
   `ACKNOWLEDGED_SUPERSEDED` (acked an earlier version — stale, excluded from
   `acknowledgedCount`) so stale acks never read as compliant.

2. **Ack feeds a signal.** `coverage-predicate.ts` documented an ack refinement
   no caller implemented — now a real `hasOutstandingAcknowledgement` helper.
   The policy library gained an "Outstanding acknowledgements" KPI + a per-row
   ack column (`acked/assigned` + warning badge) + an "outstanding" filter,
   fed by a batched per-policy rollup (`annotatePolicyAcknowledgements`,
   intersection of assigned∧acked on the current version — voluntary acks don't
   mask a gap; no N+1). **Decision:** coverage/readiness is NOT auto-gated on
   unmet acknowledgement — that would materially move readiness scores and is a
   compliance-owner call, not a silent default; the helper is ready if taken.

3. **Named-user audience.** The schema + usecase already resolved
   `{ type: 'users', userIds }` against active membership; the panel only emitted
   `all`/`role`. Added a `UserCombobox` multi-select so an admin can require
   acknowledgement from a hand-picked set (stale ids dropped).

4. **Auditor view + provenance.** The roster now carries per-entry provenance
   (`assignedById`/`assignedByName`/`assignedAt`) and a top-level `attestations`
   log (who attested the current version, newest first). The former orphaned
   `listPolicyAttestations` — exported but never routed — is subsumed by that
   log (the panel renders it), so the auditor "who attested" view is reachable
   without dead code.

## Files

| File | Role |
|------|------|
| `src/app-layer/usecases/policy.ts` | publish carry-forward + re-notify; `annotatePolicyAcknowledgements` on list |
| `src/app-layer/usecases/policy-attestation.ts` | roster: status (current/superseded/outstanding) + provenance + attestation log; removed orphan |
| `src/lib/policy/coverage-predicate.ts` | `hasOutstandingAcknowledgement` helper + coverage-gating decision note |
| `src/components/policies/PolicyAcknowledgementsPanel.tsx` | named-user picker, status badges, provenance, attestation log |
| `src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx` + `filter-defs.ts` | outstanding-ack KPI + column + filter |
| `src/lib/dto/policy.dto.ts` | `acknowledgement` on the list DTO |

## Decisions

- **Assignments carry forward; acks do not** — a revision must be re-acknowledged,
  so carried users read as outstanding until they re-ack (stale acks excluded).
- **Coverage NOT auto-gated on acknowledgement** — surfaced as a library signal
  instead; gating is a compliance-owner decision with the mechanism ready.
- **Orphan removed, not re-wired** — the roster's `attestations` log is the one
  reachable auditor surface; keeping a second dead export was the anti-pattern
  the roadmap flagged.
