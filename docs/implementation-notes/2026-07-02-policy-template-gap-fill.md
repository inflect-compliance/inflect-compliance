# 2026-07-02 — Policy-template library gap-fill

**Commit:** `<pending> feat(policy): original gap-fill templates + framework mapping`

## Design

The task requested expanding IC's policy-template library (assumed 9 templates) to
~20 using JupiterOne's taxonomy as a structural reference, plus adding a
policy→framework mapping. On investigation the premise was **stale**: IC already
ships a far larger, mapped library.

Verified current state (prod confirmed 40 `PolicyTemplate` rows):
- `prisma/fixtures/policy-templates-ciso-toolkit.json` (15) + `policy-templates-imported.json` (26), both seeded via `prisma/seed.ts` (upsert by externalRef|title), sourced from **ciso-toolkit (MIT)** — no CC-BY-SA share-alike problem.
- `prisma/fixtures/policy-template-framework-map.json` (41 policies → ISO 27001 / NIS2 with `from_toolkit`/`curated` provenance) + `src/app-layer/usecases/policy-template-mapping.ts`, which resolves the mapping against installed frameworks and surfaces **suggested** `PolicyControlLink`s. Linking is explicit (`linkPolicyControls`); `createPolicyFromTemplate` never auto-links — propose-not-commit already implemented.
- Coverage ratchets already exist (`policy-template-library-coverage`, `policy-template-mapping-coverage`, `imported-policy-templates-coverage`).

So Parts 1 and 2 were already delivered — more thoroughly than specified, and via a
better-licensed source (MIT, not CC-BY-SA). Building the task literally would create
a **parallel, duplicate** library + mapping, which the task's own "extend, don't
replace / no duplication" rule forbids. Per the stale-premise decision, we filled
only the **genuine gaps**.

## What was added (gap-fill only)

Four ORIGINAL, IC-authored templates (house style: Purpose / Scope / Policy
Statements / Responsibilities / Review) for the topics genuinely absent from the 40:

| externalRef | topic | ISO 27001 refs | NIS2 refs |
| --- | --- | --- | --- |
| `ORIG-VULN-MGMT` | Threat & Vulnerability Management | 8.8, 8.9 | Art.21(2)(e), Art.21(2)(b) |
| `ORIG-GOVERNANCE` | Corporate Governance of Information Security | 5.1, 5.2, 5.4 | Art.20(1), Art.21(2)(a) |
| `ORIG-DATA-CLASSIFICATION` | Data Classification & Handling | 5.12, 5.13, 5.9 | Art.21(2)(a) |
| `ORIG-MDM-BYOD` | Mobile Device Management & BYOD | 8.1, 6.7 | Art.21(2)(i), Art.21(2)(a) |

## Files

| File | Role |
| --- | --- |
| `prisma/fixtures/policy-templates-original-gaps.json` | The 4 original templates (`source: "IC Original"`, ORIGINAL-content `_meta.note`) |
| `prisma/seed.ts` | New seed block (mirrors the imported-policies upsert) so the 4 reach tenants via the normal `PolicyTemplate` path |
| `prisma/fixtures/policy-template-framework-map.json` | 4 new mapping entries (all-`curated`), joined by IC library requirement codes |
| `tests/guards/policy-template-library.test.ts` | Ratchet for the 4 originals + mapping resolution |
| `docs/implementation-notes/2026-07-02-policy-template-gap-fill.md` | This note |

## Decisions

- **No parallel library / no JupiterOne.** The existing ciso-toolkit (MIT) set already covers the taxonomy; JupiterOne (CC-BY-SA) was never needed and none of its prose is used. New prose is originally authored.
- **Mapping join key = IC's own library requirement codes** (`iso27001_2022_annexA.json` `key`, `nis2_requirements.json` `key`) — the same join the existing mapping uses; every new code was verified to resolve (and the existing `policy-template-mapping-coverage` dangling-code check now covers them automatically).
- **Reach tenants via the existing seed + propose-not-commit link path** — no new engine, no direct `PolicyControlLink` write from the mapping module (that write path stays `linkPolicyControls`, explicit + audited).
- ciso-toolkit's coverage map was a useful structural reference for which topics matter; JupiterOne is credited only as prior-art inspiration, not a content source.
