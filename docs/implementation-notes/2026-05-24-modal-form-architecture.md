# 2026-05-24 — Modal-form architecture (P1: design + extraction)

**Commit:** _this PR (modal-form roadmap P1 of 3)_

## Design

The four full-page form flows below ship today as standalone `/new`-style routes:

- `/t/:slug/tasks/new`
- `/t/:slug/policies/new`
- `/t/:slug/vendors/new`
- `/t/:slug/assets/:id` — the inline-editable detail page

Each lives in its own bespoke wrapper but exercises the same primitives (`FormField` + `Combobox` + `DatePicker` + `Input` + `Textarea` + per-page POST + `useFormTelemetry`). P1 introduces a shared form architecture that the modal migration (P2) and hardening pass (P3) compose into. **P1 doesn't ship the modals.** It only:

1. Extracts the form **state + submit logic** into per-entity hooks (`use<Entity>Form`).
2. Extracts the form **field markup** into per-entity field components (`<Entity>Fields`).
3. Refactors the legacy `/new` pages to compose the hook + fields (zero behaviour change).
4. Tests the extracted layers.

P2 then adds the `<NewEntityModal>` wrappers + list-page launch points + `/new` route redirects, all composing the SAME hook + fields — no duplication.

### Routing strategy — `/new` becomes a deep-link redirect

The canonical pattern is set by the already-shipped `/risks/new` (Epic 54):

```ts
// src/app/t/[tenantSlug]/(app)/risks/new/page.tsx
export default async function NewRiskRedirect({ params }) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/risks?create=1`);
}
```

The list page (`RisksClient`) reads `?create=1` on mount, opens `<NewRiskModal>`, and strips the flag so back/forward doesn't re-open. Bookmarks, "+ New Risk" deep links, and E2E `page.goto('/risks/new')` all keep working unmodified.

**P2 will apply the same shape** to `/tasks/new`, `/policies/new`, `/vendors/new`. For `/assets/:id`, the edit-modal is launched from a button on the detail page itself — no route-redirect needed (the detail page stays the canonical URL; the edit modal is an overlay).

Browser back-button semantics:

- **Modal opened from list page** — back returns to the list. Modal closes on Escape OR explicit Cancel. The `?create=1` flag is stripped after open so a refresh shows the bare list (consistent with NewRiskModal).
- **Modal opened from a deep link** (`/tasks/new`) — the redirect lands the user on `/tasks?create=1`, the modal opens, the flag is stripped. Back returns to the previous app page (NOT `/tasks/new`, which is just a redirect target).
- **Asset edit modal** — back-button behaviour is unchanged; the modal is purely overlay state with no URL impact.

### Shared form composition

Each entity gets two new modules:

```
src/app/t/[tenantSlug]/(app)/<entity>/_form/
    use<Entity>Form.ts        # state + handlers + submit + canSubmit
    <Entity>Fields.tsx        # field markup, controlled by the hook
```

The contract:

```ts
interface FormHookOptions<TResult> {
    /** Called after a successful POST. Modal closes / page navigates here. */
    onSuccess: (result: TResult) => void;
    /** Optional initial values (e.g. for edit flows). */
    initial?: Partial<TFormFields>;
}

interface FormHookReturn<TFormFields> {
    fields: TFormFields;
    setField: <K extends keyof TFormFields>(key: K, value: TFormFields[K]) => void;
    submitting: boolean;
    error: string | null;
    canSubmit: boolean;
    submit: () => Promise<void>;
}
```

The hook owns: form state, validation gates, telemetry, POST request, error handling. The field component is dumb — it renders whatever the hook tells it. Page and modal wrappers compose them differently around the same shape.

Submit/Cancel buttons belong to the WRAPPER (page or modal), not the field component — `<Modal.Actions>` is a pinned-footer slot, `<form className="flex gap-tight pt-2">` is the page-inline shape; they're not interchangeable.

### Modal shell design (for P2 reference)

Already settled by NewRiskModal. The canonical shape:

```tsx
<Modal open={open} onClose={onClose} size="lg">
    <Modal.Header>New {Entity}</Modal.Header>
    <Modal.Form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
        <Modal.Body>
            {form.error && <FormError>{form.error}</FormError>}
            <EntityFields form={form} />
        </Modal.Body>
        <Modal.Actions>
            <Button variant="secondary" onClick={onClose} disabled={form.submitting}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!form.canSubmit}>
                {form.submitting ? 'Creating…' : 'Create {entity}'}
            </Button>
        </Modal.Actions>
    </Modal.Form>
</Modal>
```

Width: `size="lg"` (NewRiskModal precedent). Body scroll: handled by `Modal.Body`. Footer pinning: `Modal.Actions` is pinned. Dirty-state warning: deferred to P3.

### Data flow & failure handling

- **State** — local to the hook (`useState`). No global state for form drafts (could be added in P3 if needed).
- **Submit** — `fetch(apiUrl('/<entity>'), { method: 'POST', body: JSON.stringify(...) })`. Identical payload to today's pages; preserves the existing E2E `submit-*-btn` IDs and the existing API contract.
- **Success** — `onSuccess(result)` callback. Page wrappers navigate to detail; modal wrappers close + navigate (or close + invalidate cache + stay).
- **Validation error** — server returns 400; hook surfaces the message in `error`. Per-field highlights stay HTML5-driven (`required` + browser validation).
- **Submit error** — same `error` slot. P3 will add cancel-with-unsaved-changes warning.
- **Authorization** — preserved exactly. `canWrite` check that today renders an inline "Permission Denied" pseudo-page becomes the modal's gate; rendering a closed modal is the equivalent.

### Asset edit — the "not a /new flow" case

`/assets/:id` is a detail page with inline editing scattered through the JSX. The naïve "stuff the whole detail page into a modal" would be wrong. The right architecture:

1. The detail page **stays** at `/assets/:id` as the canonical URL.
2. A new `<EditAssetModal>` is mounted from a "Edit asset" button in the detail header. It owns ONLY the edit form (name/category/owner/criticality/etc.) — NOT the panels, traceability, linked tasks, or activity log.
3. The hook/fields shape is identical to the create flows; only the submit method (PUT vs POST) and the initial-values seeding (from the loaded asset) differ.

P1 extracts `useEditAssetForm` + `<EditAssetFields>`. P2 wires the modal + button. The full asset detail page stays unchanged outside the edit-section refactor.

## Files

| File | Role |
|---|---|
| `docs/implementation-notes/2026-05-24-modal-form-architecture.md` | This design doc. |
| `src/app/t/[tenantSlug]/(app)/policies/_form/useNewPolicyForm.ts` | Extracted policy-create hook. |
| `src/app/t/[tenantSlug]/(app)/policies/_form/NewPolicyFields.tsx` | Extracted policy field markup. |
| `src/app/t/[tenantSlug]/(app)/tasks/_form/useNewTaskForm.ts` | Extracted task-create hook. |
| `src/app/t/[tenantSlug]/(app)/tasks/_form/NewTaskFields.tsx` | Extracted task field markup. |
| `src/app/t/[tenantSlug]/(app)/vendors/_form/useNewVendorForm.ts` | Extracted vendor-create hook. |
| `src/app/t/[tenantSlug]/(app)/vendors/_form/NewVendorFields.tsx` | Extracted vendor field markup. |
| `src/app/t/[tenantSlug]/(app)/assets/_form/useEditAssetForm.ts` | Extracted asset-edit hook. |
| `src/app/t/[tenantSlug]/(app)/assets/_form/EditAssetFields.tsx` | Extracted asset edit-form field markup. |
| `src/app/t/[tenantSlug]/(app)/policies/new/page.tsx` | Refactored — composes hook + fields. Behaviour unchanged. |
| `src/app/t/[tenantSlug]/(app)/tasks/new/page.tsx` | Refactored — composes hook + fields. |
| `src/app/t/[tenantSlug]/(app)/vendors/new/page.tsx` | Refactored — composes hook + fields. |
| `src/app/t/[tenantSlug]/(app)/assets/[id]/page.tsx` | Refactored — edit section composes hook + fields. |

## Decisions

- **Hook + fields, not a single component.** Splitting state from markup lets the same logic drive a full-page form, a modal, AND any future variant (sheet, inline panel) without duplication. The alternative — one mono-component with a `layout` prop — collapses to the same code with a worse seam.
- **Submit button stays in the wrapper, not the fields.** `Modal.Actions` is a pinned slot; page wrappers use an inline action row. Putting the button inside `<Entity>Fields` would force the wrapper to override layout, defeating the seam.
- **No URL state for modal open/closed (today).** `?create=1` is a one-shot bootstrap flag — read on mount, stripped immediately. We don't model open/close in the URL because back-button semantics get awkward (closing a modal as "back" is rarely the user's intent; deferring real deep-link-able modal state to P3 if it surfaces as a need).
- **Asset modal is bespoke, not generic.** Trying to make the same modal shape serve both create AND edit for arbitrary entities is over-engineering for the four flows in scope. Each entity gets its own modal in P2; the SHARED layer is the hook + fields, not the modal shell.
- **No new dependencies.** Everything composes today's primitives (`<Modal>`, `<FormField>`, `<Combobox>`, `<DatePicker>`, `<Input>`, `<Textarea>`). The R20 Liquid Elegance button system, R21 sculpted charts, R22 carved carbon stack — all unchanged.
