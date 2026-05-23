# 2026-05-23 — Quality roadmap (6-prompt) verification pass

**Commit:** `<pending> docs: verify-clean P3–P6 of the six-prompt quality roadmap`

## What this note records

The six-prompt quality roadmap that ran at the end of the
2026-05-23 session asked for six things. Per the
[verify-the-premise convention](../../) — and per the
`AskUserQuestion` checkpoint that explicitly surfaced the
staleness for the operator — most of the asks were already
shipped earlier in the same session or in prior roadmaps.

The genuine slice (advance `usecases/` stage 3) shipped as a
separate PR with 51 new branch-focused tests + a +1 floor bump
across all four metrics. **This** note covers the remaining four
prompts (P3–P6) — each verified against the live evidence, no
drift detected.

A future contributor asking "what was the outcome of that
roadmap?" should find this note before treating the prompts as
fresh work.

## Verification matrix

### P3 — Dedicated threshold keys for `policies/` and `events/`

**Prompt claim:** "`policies/` and `events/` do not yet have
dedicated threshold keys in `jest.thresholds.json`."

**Reality:** both keys are present and locked at measured values.

```bash
$ jq '."./src/app-layer/policies/", ."./src/app-layer/events/"' \
      jest.thresholds.json
{ "branches": 78, "functions": 88, "lines": 88, "statements": 85 }
{ "branches": 72, "functions": 60, "lines": 78, "statements": 75 }
```

Both keys are also mirrored in `RATCHET_FLOOR` in
`tests/guards/coverage-ratchet.test.ts` (cited inline in that
file as "quality roadmap P3"). The
`tests/guards/quality-coverage-integrity.test.ts` capstone
asserts the 5-key shape (`global`, `usecases/`, `policies/`,
`events/`, `lib/`).

**Shipped in:** PR #655 (2026-05-23, earlier this session).
**Drift detected:** none.

---

### P4 — First E2E wave for 4 deferred UI items

**Prompt claim:** "these items [searchbar removals, tenant
switcher, FilterToolbar, EntityDetailLayout] are deferred to E2E
suite expansion."

**Reality:** all 4 specs shipped + locked by a manifest guardrail.

```bash
$ ls tests/e2e/{search-affordances,tenant-switcher,filter-toolbar-coverage,entity-detail-layout}.spec.ts
tests/e2e/search-affordances.spec.ts
tests/e2e/tenant-switcher.spec.ts
tests/e2e/filter-toolbar-coverage.spec.ts
tests/e2e/entity-detail-layout.spec.ts
```

The `tests/guards/e2e-coverage-manifest.test.ts` registry locks
all 4 via `{surface, spec, anchor}` entries — a future PR cannot
silently delete a spec without first removing it from the
registry. The capstone meta-ratchet
(`tests/guards/quality-coverage-integrity.test.ts`) keeps the
manifest itself non-deletable.

**Shipped in:** PR #654 (2026-05-23, earlier this session).
**Drift detected:** none.

---

### P5 — Test-portfolio rebalance + layered assurance model

**Prompt claim:** "the project's quality strategy [needs] to
become more balanced and truthful."

**Reality:** the assurance model is already documented and
structurally locked.

```bash
$ wc -l docs/test-portfolio.md
149 docs/test-portfolio.md

$ grep -c "structural ratchet is never a substitute\|substitution smell\|six layers" docs/test-portfolio.md
3
```

The doc describes the six-layer model (structural ratchet, unit,
rendered, integration, E2E, manual), the "structural ratchet is
never a substitute" rule, and the substitution-smell antipatterns
that catch threshold-chasing or assertion-free fluff.

The capstone meta-ratchet asserts the file exists and still
carries those anchors:

```typescript
// tests/guards/quality-coverage-integrity.test.ts
{
  file: 'docs/test-portfolio.md',
  anchors: ['structural ratchet is never a substitute', 'six layers',
            'substitution smell'],
  ...
}
```

**Shipped in:** roadmap #4 / PRs #628–#630 (2026-05-22), then
re-verified verified-clean in roadmap #7. The 6-prompt roadmap
asked for it a third time.
**Drift detected:** none.

---

### P6 — CI ratchets for governance visibility

**Prompt claim:** "make current state and remaining debt visible
in CI/reporting" via "ratchets and reporting."

**Reality:** the 6-meta-ratchet "guard the guards" registry is
already in place.

```
tests/guards/quality-coverage-integrity.test.ts        ← capstone of P6
tests/guards/ci-pipeline-integrity.test.ts             ← ci-pipeline domain
tests/guards/observability-reliability-integrity.test.ts ← observability domain
tests/guards/verification-integrity.test.ts            ← verification-truthfulness domain
tests/guards/codebase-hygiene-integrity.test.ts        ← hygiene domain
tests/guards/dependency-governance-integrity.test.ts   ← supply-chain domain
```

Each meta-ratchet holds a `{file, pillar, anchors}` registry —
fail-loudly assertions over the pillar files, anchor-substring
preservation, and `≥3 it-blocks` for test pillars (so a future
"no-op the test" diff fails CI). Adding a new pillar means
appending to the registry.

The "remaining debt" (usecases/ ratchet at 55, climbing to 70
across stages 3/4/5/6) is documented in `docs/coverage-policy.md`
and structurally enforced via `tests/guards/coverage-ratchet.test.ts`
RATCHET_FLOOR.

**Shipped across:** PRs #618 (ci-pipeline), #621 (observability),
#630 (verification), #637 (hygiene), #633 (dependency), and #654
(quality-coverage capstone).
**Drift detected:** none.

---

## What the genuine-slice PR (stage 3a) does instead

The companion PR `quality-coverage/usecases-stage-3-wave` is the
ONLY genuine work this roadmap produced. It:

  - Adds 51 branch-focused tests across 3 previously-untested
    usecase files (`evidence-maintenance`, `control/templates`,
    `audit-readiness/sharing`).
  - Bumps `usecases/` thresholds +1 across all 4 metrics
    (branches 55→56, functions 49→50, lines 65→66, statements
    62→63) — locks the gain.
  - Splits `docs/coverage-policy.md` stage 3 into 3a (this wave,
    ✅), 3b (≈60 via `audit-readiness/packs.ts` +
    `framework/install.ts`), and 3c (≈65) so the remaining
    waves are concretely scoped.

## Files

| Path | Role |
|------|------|
| `docs/implementation-notes/2026-05-23-quality-roadmap-verification.md` | This note |

## Decisions

- **No-op PRs were rejected** at the `AskUserQuestion` checkpoint.
  Opening six PRs to document that six things already shipped
  would have burned six CI cycles producing zero new structural
  guarantee.
- **Verification doc instead of comment-only diff.** A future
  contributor opening one of P3–P6 again should land on this note
  before doing the same lookup; the doc is the durable artefact.
  Linking from each P3–P6 line item back to the live evidence
  (file path + grep command) is the bit that protects the next
  contributor.
- **No "verified" stamp added to test files or doc files.**
  Stamps drift; the actual structural surfaces (capstone
  meta-ratchet + file-exists assertions + anchor-substring
  checks) already enforce continued presence.
