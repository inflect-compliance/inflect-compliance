# 2026-06-05 — Risk + Asset attached-evidence tabs

**Commit:** _(pending)_ feat(risk/asset): attach evidence to risks + assets (Control parity)

## Design

The Risk and Asset detail pages already had an **Evidence** tab, but it
was read-only `InheritedEvidencePanel` — evidence aggregated from the
entity's *mapped controls* (Risk→Control→Evidence, Asset→Control→Evidence).
Neither let you attach evidence *directly*.

This adds direct attachment, mirroring the Control/Task pattern (#843).
The Evidence tab now stacks two sections:

1. **Attached evidence** — a Control-style `<AttachedEvidencePanel>`:
   upload a file OR link a URL, scoped to the entity via
   `Evidence.riskId` / `Evidence.assetId`, rendered through the shared
   `<EvidenceSubTable>` (with opt-in `onUnlinkEvidence`). Once added, the
   evidence shows in the Evidence Library tagged to that risk/asset.
2. **Inherited from controls** — the existing read-only panel, kept.

The Evidence Library detail sheet gains "Uploaded from risk / asset"
back-reference rows (extending the task one).

### Data model

Two additive nullable columns, identical to `Evidence.taskId`:

```
Evidence.riskId   String?  FK → Risk.id   ON DELETE SET NULL  @@index([tenantId, riskId])
Evidence.assetId  String?  FK → Asset.id  ON DELETE SET NULL  @@index([tenantId, assetId])
```

No new link tables — the column IS the association AND the back-reference.

### Flow (per entity)

- **Upload** → `POST /evidence/uploads` now accepts `riskId` / `assetId`;
  `uploadEvidenceFile` validates the entity is in-tenant and stamps it.
- **URL link** → `POST /risks/[id]/evidence/attached` (resp. assets) →
  `linkRiskEvidence` / `linkAssetEvidence` create a `LINK` Evidence row.
- **List** → `GET …/evidence/attached` → `{ links: [], evidence }`. The
  inherited evidence stays at the sibling `…/evidence` route, untouched.
- **Remove** → `DELETE …/evidence/attached/[evidenceId]` clears the FK
  (evidence survives in the library).

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` + `migrations/20260605140000_evidence_risk_asset_id/` | `Evidence.riskId` + `assetId` FKs + indexes; Risk/Asset `evidence` reverse relations. |
| `src/app-layer/usecases/risk.ts` / `asset.ts` | `get/link/unlink{Risk,Asset}Evidence`. |
| `src/app-layer/usecases/evidence.ts` + `evidence/uploads/route.ts` | upload accepts + validates `riskId` / `assetId`. |
| `src/app/api/.../{risks,assets}/[id]/evidence/attached/**` | GET/POST + DELETE routes. |
| `src/components/AttachedEvidencePanel.tsx` | NEW — reusable writable evidence panel (file/URL + EvidenceSubTable). |
| `risks/[riskId]/page.tsx`, `assets/[id]/page.tsx` | Evidence tab → Attached + Inherited sections. |
| `EvidenceRepository.ts` + `EvidenceDetailSheet.tsx` | risk/asset back-reference. |
| `src/lib/schemas/index.ts` | `LinkRiskEvidenceSchema` / `LinkAssetEvidenceSchema`. |

## Decisions

- **Two nullable columns, not link tables** — same call as `taskId`
  (#843): the column is framework-aware, retroactive, and doubles as the
  back-reference, with no RLS/migration churn (Evidence already RLS'd).
- **`/evidence/attached` sub-route** — the inherited GET already owns
  `…/evidence`; a sub-route keeps both without changing the inherited
  response shape.
- **Keep the inherited panel** — it's a distinct, useful view; the tab
  stacks both rather than replacing one with the other.
- **`AttachedEvidencePanel` is self-contained** (own fetch + state) so
  both detail pages (which use plain fetch, not SWR) drop it in with two
  props' difference.
