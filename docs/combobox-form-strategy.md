# Combobox & Form Primitive Strategy

Epic 55's close-out guide. Keep this open when you reach for a `<select>`, `<input>`, or any form field in Inflect Compliance.

## TL;DR decision tree

```
Picking a value from a list?
├─ Dynamic list OR ≥8 options OR search adds value
│    └─ <Combobox>                   (searchable; cmdk under the hood)
│
├─ 4–7 fixed options, no search value, want form-field feel
│    └─ <Combobox hideSearch>        (popover dropdown, no search)
│
├─ 2–5 fixed options, all-visible user-choice semantics, binary/tier-like
│    └─ <RadioGroup>                 (side-by-side radios)
│
├─ Picking people (owner/assignee/reviewer)
│    └─ <UserCombobox>               (single or multi; tenant-scoped fetch)
│
└─ Boolean toggle
     └─ <Switch> or <Checkbox>       (Switch for setting, Checkbox for confirm)
```

For free-text input, textareas, labels, field wrappers — always compose from `src/components/ui/` primitives. Never reach for a raw `<input className="input">` again except inside a low-level primitive.

---

## When to use each primitive

### `<Combobox>` — the default selection surface

**Use for:**
- Any list ≥8 options (category, policy type, asset type).
- Any dynamic list fetched from a server (templates, controls, frameworks).
- Any context where users will type to narrow (control linker, user picker).
- Any "searchable select" pattern that used to be paired `<input>` + `<select>`.

**Reference call sites:**
- `src/app/t/[tenantSlug]/(app)/audits/cycles/page.tsx` — framework picker.
- `src/app/t/[tenantSlug]/(app)/controls/NewControlModal.tsx` — category (with search) + frequency (hideSearch).
- `src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx` — control linker with fuzzy-match across annex id / code / name.
- `src/app/t/[tenantSlug]/(app)/risks/NewRiskModal.tsx` — template picker (fetched + loading).

**Inside a Modal/Sheet:** pass `forceDropdown` to avoid nesting a Vaul Drawer inside the Modal's own Drawer on mobile.

**Options shape:**
```ts
const OPTIONS: ComboboxOption[] = [
  { value: 'ISO27001', label: 'ISO/IEC 27001:2022' },
  { value: 'NIS2', label: 'NIS2 Directive (EU 2022/2555)' },
];
```
Fold useful tokens into the label (`"Name · email"`, `"Annex Id: Control name"`) so cmdk's fuzzy-match scores on every token.

### `<Combobox hideSearch>` — the select-shape Combobox

**Use for:** 4–7 fixed enums where search adds nothing but you still want:
- the popover-dropdown shape for compact form layouts,
- visual consistency with other Comboboxes on the same screen,
- keyboard nav via cmdk (arrow-keys, enter, escape).

**Reference call sites:** `tasks/new` type/severity/priority, `vendors/new` criticality/data-access, `findings/FindingsClient` severity/type, `clauses/ClausesBrowser` status.

### `<RadioGroup>` — user-choice, all visible

**Use for:** 2–5 fixed options where the choice is a one-time user decision and the options are ergonomically readable side-by-side.

**Reference call sites:** `vendors/new` status (Active / Onboarding — 2 options, user decision). The applicability radio inside `NewControlModal` (Applicable / Not Applicable).

**Don't use for:** long enums (5+ options that would wrap awkwardly), settings toggles (use `<Switch>`), or list-filter pickers (use `<FilterToolbar>`).

### `<UserCombobox>` — the people-picker

**Use for:** owner, assignee, reviewer, subscriber, approver — anywhere the value is a user id.

**Never** ship a free-text UUID input again. `<UserCombobox>` fetches the tenant's membership via `queryKeys.members.list(tenantSlug)`, filters to ACTIVE, and renders `"Name · email"` labels so any of name, email, or partial tokens match.

Single-select is the default. Opt into multi with `multiple={true}` — the `SingleProps | MultipleProps` discriminated union narrows `selectedId`/`selectedIds` + `onChange` signatures automatically.

**Reference call sites:** `ControlDetailSheet` owner, `NewTaskPage` assignee, `TaskDetailPage` assignee.

### `<Switch>` / `<Checkbox>`

**`<Switch>`** — binary settings that take effect immediately (dark-theme toggle, feature flag, notification opt-in).

**`<Checkbox>`** — binary choices submitted as part of a form (I agree to terms, Include in report, Multi-select row toggle).

Both are token-backed (`brand-emphasis` when checked, `border-border-error` when `invalid`). Both expose CVA `size` variants (sm/md/lg) so a 16-px checkbox next to an `<Input size="sm">` lines up pixel-for-pixel.

---

## Field-wrapper architecture

Wrap every control with the canonical layout. The wrapper owns label placement, description / error rendering, and all a11y plumbing (`htmlFor`, `aria-describedby`, `aria-invalid`, `aria-required`).

```tsx
<FieldGroup title="Contact" description="How we'll reach you" columns={2}>
  <FormField
    label="Email"
    required
    error={errors.email}
    description="We'll only contact you about audit changes."
  >
    <Input type="email" name="email" />
  </FormField>
  <FormField label="Phone">
    <Input type="tel" name="phone" />
  </FormField>
</FieldGroup>
```

### Standard rules

- **Vertical rhythm inside a field:** `gap-1.5` between label → control → hint.
- **Vertical rhythm between fields in a group:** `gap-4` (default), `gap-2`, or `gap-6` via `<FieldGroup gap>`.
- **Error beats description** in the hint slot — when error is set, description is hidden; the control paints the error border; `aria-invalid` + `role="alert"` + `aria-live` trigger automatically.
- **Required marker:** visual `*` is `aria-hidden`; the real signal is `aria-required`.
- **Horizontal layout:** `<FormField orientation="horizontal">` for checkboxes/switches where the label sits beside the control.

### Standalone building blocks

If `<FormField>`'s shape doesn't fit (rare), compose from the pieces:

- `<FormDescription>` — muted helper text (`text-xs text-content-muted mt-1.5`).
- `<FormError>` — `role="alert"` + `aria-live="polite"` + error-tone text; renders nothing when children is empty.
- `<FieldGroup>` — `<section>` with optional heading and grid layout.

---

## A few standing conventions

| Rule | Why |
|------|-----|
| **Every migrated picker carries `id` + `name`.** | `id` gives E2E a stable selector. `name` makes native `<form onSubmit>` serialisation work without glue. |
| **`invalid` prop > per-class `className` hacks.** | `FormField` injects `invalid` via `cloneElement`; every primitive then paints the right error style. |
| **`preventDefaultClose` + disabled `<fieldset>` during mutations.** | No mid-save dismissals, no post-submit edits. |
| **Invalidate `queryKeys.<entity>.all(tenantSlug)` on success.** | Atomic refresh across every list/filter/detail view. Don't narrow unless you can prove a subset suffices. |
| **Error messages in a `role="alert"` region at the form level.** | Screen readers announce the failure without focus theft. |
| **No raw `<select>`, `<input className="input">`, `<label className="input-label">` in app pages.** | Use the primitives. The `input` / `input-label` CSS classes are legacy bridge shims retained only for rare low-level cases. |

---

## Migrated surfaces (Epic 55)

| Surface | Primitives used |
|---|---|
| `audits/cycles/page.tsx` (framework) | `<Combobox>` |
| `risks/NewRiskModal.tsx` (template + category) | `<Combobox>` ×2 |
| `controls/NewControlModal.tsx` (category + frequency) | `<Combobox>` + `<Combobox hideSearch>` |
| `controls/ControlDetailSheet.tsx` (category + frequency + owner) | `<Combobox>` + `<UserCombobox>` |
| `evidence/UploadEvidenceModal.tsx` (control linker) | `<Combobox>` |
| `evidence/NewEvidenceTextModal.tsx` (control linker) | `<Combobox>` |
| `tasks/new/page.tsx` (type + severity + priority + assignee + findingSource + gapType + linkEntity) | `<Combobox hideSearch>` ×6 + `<UserCombobox>` |
| `tasks/[taskId]/page.tsx` (assignee) | `<UserCombobox>` |
| `vendors/new/page.tsx` (status + criticality + dataAccess) | `<RadioGroup>` + `<Combobox hideSearch>` ×2 |
| `findings/FindingsClient.tsx` (severity + type) | `<Combobox hideSearch>` ×2 |
| `clauses/ClausesBrowser.tsx` (status) | `<Combobox hideSearch>` |
| `policies/new/page.tsx` (category) | `<Combobox>` |

## Deferred surfaces (Epic 55 scope, deferred)

These remain on native `<select>` by design. The ratchet in `tests/guards/epic55-native-select-ratchet.test.ts` locks the current count so the number can only go down — pick these up under Epic 56 or as opportunistic cleanup.

- **Admin surfaces** — `admin/members` (base role + custom role grid), `admin/roles` (base-role fallback), `admin/api-keys` (expiry), `admin/integrations` (provider cascade). Complex permission grids and cascade validation dependencies make migration a full-surface rewrite, not a select swap.
- **Vendor detail workflow** — `vendors/[vendorId]` status/criticality/docType/assessment-template/link-entity/link-relation. Cascades to dependent fields (template → questions) and links to a legacy onboarding flow.
- **Task detail Links modal** — `tasks/[taskId]` entity type + relation (inside the Links modal; paired with free-text id, would benefit from `<Combobox>` after the entity-id input gets a proper lookup).
- **Test plan metadata** — `controls/[controlId]/tests/[planId]` frequency + method.
- **Audit inline checklist result** — `audits/AuditsClient` per-row PASS/FAIL/NOT_TESTED cell (table-inline UX needs popover tuning).
- **Bulk-action toolbar** — `tasks/TasksClient` bulk action + bulk status (table-wide multi-select workflow).

## Out of scope

- **Filter bars** — `FilterBar` / `CompactFilterBar` are superseded by Epic 53's `FilterToolbar` + `FilterSelect`. Use those for list-page filtering. `CompactFilterBar` has been removed; the loading-state skeletons are token-migrated (`SkeletonFilterBar` in `src/components/ui/skeleton.tsx`) and no longer reference the legacy components. The orphaned `src/components/filters/FilterBar.tsx` file has no remaining importers — see Future work.
- **Onboarding wizard** — `OnboardingWizard` industry/size selects. Legacy one-time flow; not a CRUD surface.

---

## Adding a new surface — checklist

1. Pick the primitive via the decision tree above.
2. Copy the closest reference surface and adapt the fields.
3. Wrap with `<FormField>` (and `<FieldGroup>` if you have multiple related fields).
4. Preserve any pre-existing E2E `id` (grep for it before you start).
5. If the picker represents a user, use `<UserCombobox>`, not `<Combobox>` + your own fetch.
6. If the picker is inside a Modal/Sheet, pass `forceDropdown`.
7. Add `name` for native form-submit serialisation.
8. Run `npx jest tests/guards/epic55-native-select-ratchet.test.ts` — the baseline should drop by 1 for every `<select>` you replaced. Update the constant accordingly.

## Guardrails

- **`tests/guards/epic55-native-select-ratchet.test.ts`** — fails CI if the `<select>` count grows; also asserts the 11 migrated surfaces stay migrated.
- **`tests/unit/epic55-form-primitives.test.ts`**, **`epic55-combobox.test.ts`**, **`epic55-field-wrapper.test.ts`** — lock the primitive API shape.
- **`tests/unit/epic55-framework-picker-migration.test.ts`**, **`epic55-user-combobox.test.ts`**, **`epic55-enum-picker-migration.test.ts`** — lock each migration's contract.

## Future work

- **Delete the orphaned `src/components/filters/FilterBar.tsx`.** It is
  superseded by Epic 53's `FilterToolbar` and has no remaining importers;
  the file can be removed in a cleanup PR.
