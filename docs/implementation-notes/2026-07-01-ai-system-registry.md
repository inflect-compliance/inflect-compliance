# 2026-07-01 — EU AI Act AI-System Registry + conformity draft generation

**Commit:** `<pending>` feat(ai-act): AI-system registry + risk classification + conformity drafts

## Context — three distinct AI-governance layers

IC already had two AI-governance surfaces; this adds the missing third:

1. **Frameworks** (`EU-AI-ACT`, `ISO42001`) — the org-wide *requirement
   catalogues*. Global rows shared across tenants.
2. **AI self-assessment** (AISVS / ISO 42001 / AI-Act posture) — a tenant's
   *overall* readiness snapshot.
3. **AI-System Registry (this)** — the register of each *concrete AI system* a
   tenant provides or deploys, its EU AI Act risk-tier classification, and its
   linkage to the obligations that tier pulls in.

## Design

### Classification (authored from the Act)

`src/lib/eu-ai-act/classification.ts` is a pure, deterministic, explainable
classifier authored directly from Regulation (EU) 2024/1689:

- **Article 5** prohibited practices → `PROHIBITED`
- **Article 6(1) + Annex III** high-risk use-cases → `HIGH`
- **Article 50** transparency triggers → `LIMITED`
- otherwise (**Article 95** voluntary codes) → `MINIMAL`

Strict precedence `PROHIBITED > HIGH > LIMITED > MINIMAL`. It always returns the
driving clause id (e.g. `Annex III(4)`, `Art.5(1)(c)`) and a rationale, so the
register shows *why* a system is high-risk. The tier is computed server-side and
is never accepted from the client.

### Tier → obligation map

`src/lib/eu-ai-act/obligations.ts` maps each tier to framework requirement
`code`s against IC's own seeded library: `HIGH` pulls the full high-risk set
(Art 9–17, 26, 27 + ISO 42001 clauses 6.1/8.2/8.3/8.4/9.1); `LIMITED` pulls the
Art 50 transparency duty; `MINIMAL` the Art 95 voluntary measures; `PROHIBITED`
carries the Art 5 citation. On registration, `createAiSystem` resolves these
codes to `FrameworkRequirement` ids and creates `AiSystemRequirementLink` rows
inside `runInTenantContext` with a `logEvent` audit. The map has no dangling
refs (ratchet-enforced).

### Conformity artifacts — propose-not-commit

`src/app-layer/usecases/ai-system-conformity.ts` drafts, for HIGH-risk systems,
the three artifacts the Act requires — Technical Documentation (Annex IV), Risk
Management record (Art 9), Declaration of Conformity (Annex V) — from the
registry data + linked obligations. It routes each draft through the
**`createAgentProposal`** approval queue. It makes **no** direct
`createPolicy`/`publishPolicy` call: a human with write permission approves the
proposal before any (still-DRAFT) policy exists, and a Declaration of Conformity
is **never** auto-issued. Issuing conformity is a human legal act.

## Files

| File | Role |
| --- | --- |
| `src/lib/eu-ai-act/classification.ts` | pure risk-tier classifier + questionnaire option catalogues (from the Act) |
| `src/lib/eu-ai-act/obligations.ts` | tier → requirement-code map |
| `prisma/schema/compliance.prisma` | `AiSystem` + `AiSystemRequirementLink` (Class-A tenant shape) |
| `prisma/migrations/20260703120000_ai_system_registry/` | tables + enums + canonical RLS trio on both tables |
| `src/app-layer/schemas/ai-system.schemas.ts` | create + generate-draft Zod schemas |
| `src/app-layer/repositories/AiSystemRepository.ts` | tenant-scoped queries |
| `src/app-layer/usecases/ai-system.ts` | classify → persist → link obligations + audit |
| `src/app-layer/usecases/ai-system-conformity.ts` | propose-not-commit draft generation |
| `src/app/api/t/[tenantSlug]/ai-systems/**` | list / create / detail / conformity routes |
| `src/app/t/[tenantSlug]/(app)/risks/ai-systems/**` | EntityListPage registry + New modal + detail |
| `tests/guards/ai-system-registry.test.ts` | classification/mapping/propose-not-commit/AGPL ratchet |

## Decisions

- **Nested under Risks, not a new sidebar section.** The registry lives at
  `/risks/ai-systems` beside the existing `/risks/ai` AI-assist page — no
  sidebar sprawl. Registered in `page-segregation` SUBPAGES + `canonical-parents`.
- **A dedicated `AiSystemRequirementLink` join**, mirroring
  `ControlRequirementLink`, rather than forcing AI systems through the Control
  model — an AI system is not a control.
- **`purpose` / `useContext` encrypted + sanitised.** A system's purpose and
  deployment context can describe sensitive business processes: routed through
  `sanitizePlainText` on write and added to the Epic B `ENCRYPTED_FIELDS`
  manifest (not searched, so encryption is safe).
- **AGPL boundary.** Every rule is authored from Regulation (EU) 2024/1689.
  Nothing derives from the AGPL-3.0 `SdSarthak/AegisAI` project — enforced by an
  AGPL tripwire in the ratchet.

## Not doing

- The RAG regulatory-intelligence pillar (separate item).
- An ML injection classifier (separate item).
- Auto-publishing conformity declarations (never — human legal act).
