# 2026-07-16 — Complete the partial control linkage/analytics surfaces

**Commit:** `<pending> feat(controls): complete linkage/analytics surfaces (mappings, applicability, sankey, …)`

## Design

Eight partial surfaces on the control subsystem, completed without any new
navbar entries (existing tabs/pages extended).

1. **Mappings naming + reverse-lookup.** The "Mappings" tab holds only
   control↔requirement links (risks/assets live in "Traceability"), so it's
   renamed **Requirements**. `ControlReverseLookupModal` (process-maps only, with
   a stale docstring naming tabs that don't exist) now also shows the
   requirements/risks/assets the control links, from the existing endpoints. The
   misnamed repo method `listFrameworkMappings` (it reads `controlRequirementLink`,
   not the legacy `FrameworkMapping` island) → `listControlRequirementLinks`.
2. **Contributors** get add (`UserCombobox`) + remove affordances (backend
   `list/add/removeContributor` + routes existed; the page showed them read-only).
3. **Per-framework applicability.** `Control.applicability` was one global value,
   so a control N/A for framework A read N/A everywhere. Added a nullable
   `applicability` + `applicabilityJustification` override to
   `ControlRequirementLink` (NULL = inherit the control's global value; no
   backfill). SoA + coverage/readiness now read the **effective** value
   (`link ?? control`). New `setRequirementLinkApplicability` usecase + `POST
   /controls/[id]/requirements/[reqId]/applicability` + a per-row toggle in the
   Requirements tab.
4. **Sankey control→requirement.** The graph type declared `requirement`/`policy`
   node kinds + an `implements` edge but the builder never emitted them. Built
   the real flow: query `controlRequirementLink`, emit requirement nodes +
   `implements` edges, add a requirement column to the sankey layout.
5. **Consistency-check deep-links.** The dashboard counts (missing/duplicate
   code, overdue tasks) were dead numbers; the response already carries the
   offending control ids, so each count now deep-links to
   `/controls?ids=<offending ids>`, and the list filters to that set + shows a
   "Showing N flagged controls · Clear" banner.
6. **Template install polish.** Pre-install preview (`{N} tasks · {M} requirement
   links` per template, from the `_count` already fetched); the "Installed N"
   toast now counts only real installs (the usecase returns a `skipped` flag for
   an already-existing control instead of counting it); templates-page search
   restored.
7. **coverageType.** The asset↔control link form sent only `{controlId,
   rationale}` → every link stored `UNKNOWN`. Added a coverageType picker
   (FULL/PARTIAL/UNKNOWN) to the affordance (the route schema already accepted it).
8. **Test-plan detail SWR + routing.** Migrated the `TODO(swr-migration)`
   fetch-on-mount page to `useTenantSWR`. Routing decision: **keep the split tree
   (plan under `/controls/…/tests/[planId]`, runs under `/tests/runs/[runId]`)
   but make breadcrumbs explicit** — the plan page gains a Dashboard → Controls →
   control → plan chain, and the run page's inconsistent fallback crumb (which
   flipped between `/tests` and `/controls`) is made consistent. The guided runner
   is untouched.

## Decisions

- **Per-framework applicability as a nullable link override** — no backfill,
  every existing link inherits the global value, so today's behaviour is
  preserved until a per-framework N/A is explicitly set. SoA/coverage read
  `link ?? control` so the surfaces stay a single source of truth.
- **Build the sankey flow, don't delete the stubs** — the data (`controlRequirementLink`)
  and the type scaffolding already existed; drawing it is the "complete them"
  spirit of the roadmap.
- **Rename the tab, don't merge the surfaces** — merging requirements+risks+assets
  into one tab is a bigger UX change; renaming "Mappings"→"Requirements" removes
  the misleading implication with far less risk, and the reverse-lookup modal
  gives the unified "where used" view.
- **Split test-plan routing kept, breadcrumbs bridge it** — moving the run route
  under the control tree is riskier than making the existing navigation explicit.
