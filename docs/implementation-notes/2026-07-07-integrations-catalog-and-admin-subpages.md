# 2026-07-07 — Integrations provider catalog + Devices/Training/Personnel → Admin subpages

**Commit:** `<pending>` feat(nav+integrations): provider catalog, admin subpages, empty-dropdown fix

## Design

Three related UI/plumbing changes after the Vanta-equalization roadmap surfaced
gaps in how its backend work reached the UI.

### 1. Bug: empty "Add Integration → provider" dropdown (+ dead check providers)

`src/app-layer/integrations/bootstrap.ts` registers every provider into the
registry as **top-level module side effects** (`registry.register(new …())`).
Nothing imported that module anywhere in `src/`, so the registry was empty in
*every* runtime path — the admin dropdown (`listAvailableProviders()` → `[]`)
AND the check/sync consumers (automation-runner, sync-pull, webhook-processor,
hris-sync, identity-sync). The providers shipped by PR-1..PR-6 were effectively
dead.

Fix — register the side-effect module at each entry point (no provider imports
back into these, so no cycle):
- `usecases/integrations.ts` — static `import '../integrations/bootstrap'` (the
  load-bearing one for the reported dropdown bug; the admin route imports this
  usecase).
- `instrumentation.ts::register()` — web tier startup.
- `scripts/worker.ts` bootstrap — worker tier startup (scheduled checks/sync).

### 2. Integrations provider catalog

The page was already generic (the Add form renders any registered provider's
`configSchema` dynamically), but only SharePoint had a *visible* card — every
other provider hid behind "Add Integration → dropdown". Added an
"Available integrations" catalog: each connectable provider (config/secret
fields > 0 — excludes internal-only personnel/device/training check providers)
renders as a card with a **Connect** button that opens the existing Add form
pre-selected. No bespoke per-provider components; reuses all existing machinery.

### 3. Devices / Training / Personnel → Admin subpages; Access Reviews → nav

PRs 4–7 shipped pages with no nav entry. Per the operator's decision:
- **Access Reviews (UAR)** stays top-level (`/access-reviews`), gains a sidebar
  item in the **Comply** group.
- **Devices / Training / Personnel** move under `/admin/` (literal URL change),
  inheriting the admin-permission layout, surfaced as pills on the `/admin` hub
  and a smart back affordance on each page.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/integrations.ts`, `src/instrumentation.ts`, `scripts/worker.ts` | register providers (fix empty registry) |
| `src/app/.../admin/integrations/page.tsx` | provider catalog + Connect handler |
| `src/app/.../admin/{devices,training,personnel}/**` | moved from `(app)/…` |
| `src/app/.../admin/page.tsx` | three new hub pills |
| `src/components/layout/SidebarNav.tsx` | Access Reviews nav item |
| `src/lib/nav/page-segregation.ts`, `canonical-parents.ts` | reclassify moved routes as `/admin/*` subpages |
| `tests/guards/no-lucide.test.ts` | allowlist paths follow the move |
| `messages/{en,bg}.json` | admin nav + catalog strings |

## Decisions

- **Register at startup + at the usecase.** Belt-and-suspenders: the usecase
  import guarantees the dropdown regardless of instrumentation ordering; the
  startup hooks cover the async check/sync consumers process-wide.
- **Catalog filters to connectable providers.** Internal check providers
  (personnel/device/training) carry no config and are driven by their own
  pages, so they'd be confusing "Connect" cards.
- **Moving URLs (not just linking) was the operator's explicit choice** — it
  trips the route-classification + typography/badge guards, all updated in this
  diff. Moving under `/admin/` also gates these pages behind `admin.view` (was
  `personnel.view`), an accepted consequence of the "Admin subpage" decision.
