# 2026-07-19 — Policy acknowledgement rollup, approval SoD, and rollback reconciliation

**Commit:** `<pending>` feat(policy): server-side ack rollup + author-aware approval SoD + rollback ack carry-forward

## Design

Five independent policy-surface residuals, unified by one theme: **the
acknowledgement campaign is a first-class, tenant-scoped fact, and every
surface that reports on it must agree with the database rather than with
whatever happened to be loaded on the current page.**

### 1. Acknowledgement rollup — page-scoped scan → server-side aggregate

`annotatePolicyAcknowledgements` previously issued two `take: 20000` row
fetches and reduced them in memory. That is expensive, silently truncating,
and — worse — it made "outstanding acknowledgement" a property of the loaded
page rather than of the tenant.

It now consumes a single `ackCountsByVersion()` aggregate in
`PolicyRepository`, a parameterised `$queryRaw` tagged template:

```
assigned = COUNT(*)::int
acked    = COUNT(k."userId")::int      -- LEFT JOIN on (policyVersionId, userId)
```

The LEFT JOIN is what makes `acked` the **intersection** of assignees and
acknowledgers. A plain `groupBy` over the acknowledgement table would count a
*voluntary* ack from a user who was never assigned, inflating completion on
exactly the policies an auditor cares about. The join is additionally pinned
with an explicit `pv."tenantId" = ${ctx.tenantId}` on top of RLS — defence in
depth, per the two-layer isolation contract.

`outstandingAckVersionIds()` backs a new server-resolved `outstanding` filter.
It folds `currentVersionId: { in: ids }` into the `where` in **both** `list`
and `listPaginated` via a shared private helper, so the facet composes with
existing filters and survives pagination instead of degrading after page one.

### 2. Approval SoD — requester-aware → author-aware

`ApprovalBanner` suppressed the approve/reject affordance when the current
user was the *requester*. That misses the more common conflict: the person
who **wrote** the version approving their own text, having had someone else
click "request approval". `ApprovalBannerApproval` gained `versionAuthor`, and
the self-approval test is now the disjunction of requester and author.

### 3 + 4. Rollback reconciliation and carry-forward provenance

`publishPolicy` carried the acknowledgement campaign forward to the new
version; `rollbackPolicy` did not — so a rollback silently emptied the roster
and nobody was re-asked to acknowledge the version they were now bound by.

Both paths now call one extracted `carryForwardAckCampaign` helper, so the two
can no longer drift. The helper preserves `assignedById` from the prior
assignment rather than stamping the publisher: stamping would rewrite
"requested by" on the roster at every revision, destroying audit attribution
for the original request. `rollbackPolicy`'s transaction returns
`{ rolledBack, carriedAckUserIds, policyTitle, restoredVersionId }` so the
post-commit re-notify can run outside the transaction.

### 5. Polish

Approval status badges were rendering raw enum values (`APPROVED`) — now
localized through an `approvalStatusLabel` helper with a raw fallback. The
detail DTO gained the `comment` field it was already being handed, removing a
cast.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/repositories/PolicyRepository.ts` | `ackCountsByVersion()` + `outstandingAckVersionIds()`; `outstandingAck` filter folded into `list` + `listPaginated` |
| `src/app-layer/usecases/policy.ts` | `annotatePolicyAcknowledgements` consumes the aggregate; `carryForwardAckCampaign` extracted and called from publish + rollback |
| `src/app/api/t/[tenantSlug]/policies/route.ts` | `outstanding=true` threaded through `PolicyQuerySchema` |
| `src/app/t/[tenantSlug]/(app)/policies/page.tsx` | SSR searchParams allowlist widened (`outstanding`, `reviewBucket`) |
| `src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx` | Acknowledgement column + outstanding-acks KPI |
| `src/app/t/[tenantSlug]/(app)/policies/filter-defs.ts` | `outstanding` facet |
| `src/components/ui/ApprovalBanner.tsx` | `versionAuthor` + author-aware self-approval suppression |
| `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx` | Passes `versionAuthor`; localized approval badges |
| `src/lib/dto/policy.dto.ts` | `comment` on the detail approvals schema |
| `src/lib/policy/coverage-predicate.ts` | Comment now describes shipped behaviour |
| `messages/{en,bg}.json` | `policies.list.ackProgress` |

## Decisions

- **Reused the orphaned ack i18n keys instead of adding parallel ones.**
  `policies.filters.acknowledgement`, `filterEnums.acknowledgement`,
  `colHeaders.acknowledgement`, `list.kpiOutstandingAck` and
  `list.ackOutstandingBadge` already shipped on main, fully translated in both
  locales, referenced by **zero** files — an earlier round landed the strings
  without the feature. Pointing the new code at them consumes the orphans and
  avoids two near-identical key families. Only `list.ackProgress` was
  genuinely new.

- **`acked` via LEFT JOIN, not `groupBy`.** See above — a `groupBy` counts
  voluntary acks from non-assignees and overstates completion.

- **The acknowledgement column is deliberately not sortable.** Sorting it
  would sort the loaded page only, which directly contradicts the promise the
  server-resolved filter makes. A page-scoped sort next to a tenant-scoped
  filter is the kind of quiet inconsistency this change exists to remove.

- **The KPI count is page-scoped while the filter it applies is
  tenant-scoped**, so clicking it can reveal more rows than the number on the
  card. This is the pre-existing asymmetry shared by every KPI card on the
  page; it is documented at the `KpiFilterDef` rather than special-cased here.

- **`assignedById` carried from the prior assignment, not restamped.**
  Provenance of the original request is audit-relevant; restamping would
  quietly rewrite it on every revision.

- **SSR allowlist gained `reviewBucket` alongside `outstanding`.** Not part of
  the original ask: `?reviewBucket=overdue` deep-links SSR'd unfiltered until
  SWR refetched. Same bug class, same line — fixing one and leaving its
  sibling broken would have been worse than the small scope creep.
