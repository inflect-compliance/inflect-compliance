# 2026-07-13 — Integrations & identity consolidation hub

**Commit:** _(P3 of the integrations roadmap)_

## Design

Integration and identity configuration was scattered across seven sibling
admin pages (`sso`, `scim`, `entra`, `integrations`, plus `personnel` /
`devices` / `training`) with no organizing story: the Integrations hub had
**no sidebar entry at all** (reachable only by typing the URL or via the flat
admin pill grid), the connector catalog was one undifferentiated list, and a
user wiring Okta *sign-in* (SSO) had no signal that the Okta *data-sync*
connector is a separate thing under Integrations. P3 gives the cluster one
coherent shape without moving any backend seam.

- **Integrations reachable from the sidebar.** Added a `Plug`-iconed
  `/admin/integrations` entry to the SidebarNav "Manage" section, gated by
  `perms.admin.view` like its siblings.
- **Connectors grouped by category.** `listAvailableProviders` now projects a
  `category` (from a central `PROVIDER_CATEGORY` map: identity / cloud / scm /
  hris / document / internal), and the hub renders one `<Eyebrow>`-headed
  group per category in a fixed `CATEGORY_ORDER`. Adding a provider needs one
  map entry, not a page edit.
- **Admin index grouped into labelled sections.** The flat 19-pill grid became
  a data-driven `sections` array — Identity & access, Integrations, People,
  Organization, Security & governance, Risk configuration — each an
  `<Eyebrow>` + pill row. Every pill `id` is preserved (E2E anchors intact).
- **Identity wayfinding, both ways.** A shared `<IdentityCrossLinks>` strip
  (SSO sign-in · SCIM provisioning · Entra ID · Data connectors) mounts on all
  four surfaces with the current one marked `aria-current`. This is the
  explicit Okta-login ↔ Okta-connector cross-link the prompt asked for: from
  SSO you reach the connector hub in one click and vice versa.

## Decisions

- **`PROVIDER_CATEGORY` is a central map, not a per-provider field.** Ten
  provider classes would each need editing to add a `category` property;
  instead the hub owns the taxonomy in one place, matching how the UI groups
  them. A provider absent from the map falls back to `other`.
- **One connection model is deferred, deliberately.** SharePoint keeps its
  bespoke delegated-OAuth-consent card (it is the only provider with an
  app-install flow); the generic config-field connections render in the
  categorized grid. Folding SharePoint into the generic grid would mean
  building a config-field representation of an OAuth-consent handshake — a
  backend project, not a layout change. The two models now sit under one hub
  with consistent chrome; unifying the underlying connection primitive is a
  tracked follow-up.
- **Cross-links are a component, not per-page markup.** A single
  `IdentityCrossLinks` keeps the four surfaces in lockstep — adding a fifth
  identity surface is one array entry, and the ratchet asserts every surface
  mounts it.

## Files

| File | Role |
|---|---|
| `src/components/layout/SidebarNav.tsx` | Integrations hub nav entry (`Plug`) |
| `src/app-layer/usecases/integrations.ts` | `PROVIDER_CATEGORY` map + `category` projection |
| `.../admin/integrations/page.tsx` | connectors grouped by category; mounts cross-links |
| `.../admin/page.tsx` | flat pills → labelled `sections` |
| `src/components/admin/IdentityCrossLinks.tsx` | shared identity wayfinding strip |
| `.../admin/{sso,scim,entra}/page.tsx` | mount `<IdentityCrossLinks>` |
| `messages/{en,bg}.json` | `admin.section.*`, `admin.identityNav.*`, category + nav keys |
| `tests/guards/p3-integrations-hub.test.ts` | structural ratchet |
