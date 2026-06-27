# 2026-06-27 — Framework-aware policy templates (ISO 27001 / NIS2 link suggestions)

**Commit:** `<sha> feat(policies): framework-aware policy templates (ISO27001/NIS2 link suggestions)`

Credit: the underlying policy content + control references are from
[`D4d0/ciso-toolkit`](https://github.com/D4d0/ciso-toolkit) (MIT). This PR builds
the framework-mapping layer on top of the Prompt-1 template library.

## Design

A policy template is generic markdown until it's connected to the controls it
satisfies. IC already has the linkage machinery (`PolicyControlLink`), the
framework content (ISO 27001 Annex A + NIS2 requirements seeded as
`FrameworkRequirement`s), and framework installation (Control Packs →
`Control` + `ControlRequirementLink`). This PR adds the missing piece: a curated
**suggestion** layer that, when a tenant creates a policy from a framework-aware
template, offers to pre-populate `PolicyControlLink` rows.

The bridge (there is no `Policy → Requirement` link in the schema — only
`Policy → Control`):

```
mapping fixture (policy externalRef → requirement codes, with provenance)
   └─ resolve codes → FrameworkRequirement rows (installed frameworks only)
        └─ tenant Controls covering them (ControlRequirementLink)
             └─ suggested PolicyControlLink targets (explicit confirm)
```

Two load-bearing honesty constraints:

1. **Suggestions, not attestations.** The mappings are suggestions a tenant
   reviews and confirms; they are never an authoritative compliance claim.
2. **Explicit, never automatic.** `createPolicyFromTemplate` never creates a
   `PolicyControlLink`. The only write path is `linkPolicyControls`, driven by an
   explicit tenant confirm in the UI.

## Provenance — the load-bearing distinction

The ciso-toolkit policies carry **NIST-CSF** control references in their
frontmatter (e.g. `ID.RM-1.1`, `PR.AC-1.1`). The toolkit does **not** provide an
ISO 27001 Annex A or NIS2 article matrix — only a blanket
`related_laws: [ISO 27001, NIS2]`. So *every* ISO/NIS2 requirement code in the
mapping fixture is our translation:

- **`from_toolkit`** — traces to a CSF ref the toolkit explicitly lists for that
  policy, crosswalked to the requirement via the standard CSF↔ISO27001:2022
  informative-reference crosswalk. **Pre-checked** in the confirm UI.
- **`curated`** — our domain judgment, not backed by a toolkit reference. Left
  **unchecked** — the tenant opts into our judgment explicitly.

This distinction is surfaced per-suggestion (badge "suggested (toolkit)" vs
"suggested (curated)") and is the reason the confirm UX defaults curated mappings
off.

## Files

| File | Role |
|------|------|
| `prisma/fixtures/policy-template-framework-map.json` | The curated mapping (15 policies → ISO/NIS2 requirement codes + provenance + disclaimer/CSF-origin note). No schema/seed change — read at runtime. |
| `src/app-layer/usecases/policy-template-mapping.ts` | `getSuggestedControlLinks` (install-gated resolution), `linkPolicyControls` (explicit idempotent write), `getInstalledMappedFrameworks` (picker badge), `getTemplateExternalRef`. |
| `src/app/api/.../policies/templates/suggestions/route.ts` | GET `?ref=POL-02` → suggestions. |
| `src/app/api/.../policies/[id]/control-links/route.ts` | POST `{controlIds}` → explicit confirm-and-link. |
| `src/app/api/.../policies/route.ts` | POST create-from-template now attaches `suggestedControlLinks` to the 201 response. |
| `src/app/api/.../policies/templates/route.ts` | GET annotates each template with `mappedFrameworks` (installed ∩ mapped). |
| `src/app/.../policies/templates/page.tsx` | Picker badge ("Maps to ISO 27001 + NIS2") + post-create confirm flow. |
| `src/app/.../policies/templates/TemplateControlSuggestModal.tsx` | The confirm-and-link panel (pre-checked toolkit, unchecked curated). |
| `tests/guardrails/policy-template-mapping-coverage.test.ts` | No-dangling-ids, provenance, install-gate, no-auto-link, UI pre-check ratchet. |
| `tests/unit/policy-template-mapping.test.ts` | Resolution logic (grouping, provenance→preChecked, install-gating, idempotent link). |

## Decisions

- **No schema change.** `PolicyControlLink`, `FrameworkRequirement`,
  `ControlRequirementLink` already exist; the mapping is a runtime fixture
  (bundled via `resolveJsonModule`), not a seeded table. Re-curating is a fixture
  edit, reviewed in PR — appropriate for compliance-load-bearing judgment.
- **Real requirement-code format.** The prompt's example ids (`A.5.1`,
  `nis2-gov-…`) were placeholders; the seeded codes are `5.1` (ISO) and
  `Art.21(2)(a)` (NIS2). The ratchet asserts the real format + that every id
  resolves.
- **Install-gating by reachability.** "Installed" = the tenant has ≥1
  `ControlRequirementLink` into a framework's requirements — derived from the
  Control-Pack install flow, no separate adoption model needed.
- **Suggest controls, not requirements.** Since the only policy link is
  `PolicyControlLink`, the suggestion resolves mapped requirements → the tenant's
  controls that cover them. A control surfaced by both a toolkit and a curated
  requirement is marked `from_toolkit` (the stronger signal wins → pre-checked).
- **Confirm path stays separate from create.** `createPolicyFromTemplate` is left
  pure (returns the policy, no link logic) so the no-auto-link invariant is
  trivially verifiable; the route layer composes create + suggestion read.
