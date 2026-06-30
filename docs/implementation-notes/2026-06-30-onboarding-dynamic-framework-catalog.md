# 2026-06-30 — Onboarding framework picker is data-driven

**Commit:** `<sha>` feat(onboarding): data-drive the wizard framework picker off the catalog

## Design

The setup wizard's **Frameworks** step hardcoded exactly two cards
(ISO 27001 + NIS2) even though the seeded catalog ships **nine** installable
frameworks (ISO 27001, NIS2, DORA, AISVS, ISO 42001, EU AI Act, ISO 9001,
ISO 28000, ISO 39001 — each with a baseline control pack). The "two" was
baked in across three layers:

1. the picker card array (`FrameworkSelectionStep`),
2. the control-install + review label maps (`{iso27001, nis2}`),
3. the installer's framework→pack key map (`FRAMEWORK_PACK_KEYS`).

The fix makes all three data-driven off the catalog:

- **Picker** fetches `GET /api/t/:slug/onboarding/frameworks` →
  `listInstallableFrameworks`, which returns every framework that ships at
  least one pack (`where: { packs: { some: {} } }`), projected to
  `{ key, name, version, description, kind, requirementCount, controlCount }`.
  A framework with requirements but no pack is excluded — selecting it would
  install nothing.
- **Install** resolves each selected framework's packs at completion via a
  single `frameworkPack.findMany` (grouped case-insensitively), then calls
  the existing idempotent `installPack` per pack. No hand-maintained map.
- **Labels** are captured at selection time into a `frameworkLabels` map in
  step data, so the Controls and Review steps render names without a second
  fetch or a literal map.

### Key model: canonical DB keys + case-insensitivity

The picker now stores the **canonical DB framework key** (`ISO27001`,
`NIS2`, …) instead of the old lowercase literals. This is safe because the
conditional-step gates (`NIS2_SELF_ASSESSMENT`, `AI_GOVERNANCE_SELF_ASSESSMENT`)
and the server `isStepApplicable` already match case-insensitively. Two
matchers were made case-insensitive to bridge the change and tolerate legacy
in-progress states that stored lowercase keys:

- `selectApplicableRisks` — starter-risk tags are lowercase; selection is now
  uppercase. Normalises both sides to lower.
- `executeFrameworkInstall` — groups packs by `framework.key.toLowerCase()`.

Card testids stay lowercased (`fw-${key.toLowerCase()}`) so existing E2E
selectors (`fw-iso27001`, `fw-nis2`) are unaffected.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/framework/catalog.ts` | New `listInstallableFrameworks` (packs-only projection) |
| `src/app-layer/usecases/framework/index.ts` | Barrel export |
| `src/app/api/t/[tenantSlug]/onboarding/frameworks/route.ts` | New GET route (mirrors `state`) |
| `src/app-layer/usecases/onboarding-automation.ts` | Dynamic pack resolution; removed `FRAMEWORK_PACK_KEYS`; case-insensitive risk match |
| `src/components/onboarding/OnboardingWizard.tsx` | Data-driven picker + label-map capture; review/control labels off the map |
| `tests/guardrails/onboarding-framework-catalog-dynamic.test.ts` | Ratchet: picker/installer stay catalog-driven |

## Decisions

- **Filter to frameworks with a pack, not all frameworks.** Install is
  pack-based, so a requirement-only framework can't contribute controls.
  Showing it would be misleading ("Installs 0 controls"). SOC 2 is seeded
  without a pack and is therefore intentionally absent until one is authored —
  at which point it appears automatically.
- **One `findMany`, group in memory** rather than a per-framework query — the
  N+1 query-shape guard (D1) flags a Prisma read inside a loop, and the pack
  table is tiny and global.
- **Capture labels at selection** instead of re-fetching in the Review step —
  avoids a second round-trip and keeps the review render synchronous.
