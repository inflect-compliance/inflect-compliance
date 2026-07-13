# 2026-07-13 — Generic connect-form fidelity

**Commit:** _(P2 of the integrations roadmap)_

## Design

The generic connect form rendered EVERY config field as a single-line text
input, ignoring its declared type — so the AWS/Azure/GCP benchmark (a
`select`) was a free-text box that silently mis-mapped on a typo, and the
Google/GCP service-account JSON (a multi-KB blob) was a one-line input.
Test-connection reported a green check even for shape-only validations, and
internal check providers were a confusing free-form Add entry.

- **Field types.** `ConfigField.type` gained `'textarea'`; the form now
  renders each field as its declared type via a `renderField` switch —
  `select` → `<Combobox>` from `options`, `number` → numeric input, `boolean`
  → `<Checkbox>`, `textarea` → `<Textarea>` (the SA-JSON secrets), `string` →
  text/masked input. Google + GCP `serviceAccountJson` are now `textarea`.
- **Setup guidance.** `IntegrationProvider` gained `setupGuide` (rendered
  above the form) telling admins what the integration needs and where to get
  it — token scopes, service-account domain-wide delegation, and the
  powerpipe/CLI-on-the-collector-host prereqs for AWS/Azure/GCP.
- **Honest test-connection.** `IntegrationProvider.liveValidation` marks
  whether `validateConnection` does a real third-party probe (AWS, Okta) or
  only checks field shape (Azure/GCP/Google/BambooHR). The Test result is
  labelled accordingly — a green check on a shape-only provider says
  "Configuration looks valid (shape only — connectivity not verified)".
- **Internal providers.** Personnel/Device/Training carry no credentials but
  still need a connection row to run. They're removed from the free-form Add
  dropdown and enabled in one click via **"Enable internal checks"**, which
  auto-provisions their connections. The confusing zero-field banner is gone.
- **Edit made reachable.** Editing a connection was dead UI (nothing set
  `editingId`). Added an Edit row action + the "leave blank to keep the
  stored secret" hint.

## Decisions

- **OAuth-consent reuse is N/A today.** SharePoint is the only provider with
  an app-install/OAuth flow; no other provider has an OAuth backend, so there
  is nothing to "reuse it for" yet — the setup guidance points paste-a-secret
  providers at their credential source instead. Wiring OAuth for a second
  provider is a per-provider backend project, not a form change.
- **`liveValidation` is provider-declared, not inferred.** Rather than guess
  from the code whether a probe is live, each provider states it — the single
  source of truth for the honest-test label.

## Files

| File | Role |
|---|---|
| `src/app-layer/integrations/types.ts` | `ConfigField` `'textarea'`; `IntegrationProvider.setupGuide` + `liveValidation` |
| `src/app-layer/integrations/{aws,providers/azure,providers/gcp}-posture-provider.ts`, `providers/{okta,google-workspace,hris}/index.ts` | setupGuide + liveValidation; JSON secrets → textarea |
| `src/app-layer/usecases/integrations.ts` | project the new fields |
| `.../admin/integrations/page.tsx` | `renderField` type switch, setup guidance, honest test label, internal-provider enable, edit action |
| `tests/guards/p2-connect-form-fidelity.test.ts` | ratchet |
