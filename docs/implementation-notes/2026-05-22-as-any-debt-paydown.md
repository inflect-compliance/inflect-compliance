# 2026-05-22 — `as any` debt paydown

**Commit:** `<pending> refactor(types): eliminate as-any debt across src/`

## Design

The codebase carried **174 `as any` casts** (code-level count, the
ratchet heuristic) across **69 files**. A ratchet
(`tests/guardrails/no-explicit-any-ratchet.test.ts`, baseline 175)
prevented *growth* but the existing debt had never been paid down.
Roadmap-6 P1 eliminated it: **174 → 4** (97.7%).

### Diagnosis — the cast taxonomy

The casts fell into a small number of categories, ranked by risk:

| Category | ~Count | Risk | Genuine fix |
|----------|--------|------|-------------|
| API route `body as any` → usecase | 18 | **High** — request/response boundary | usecase param `= z.infer<typeof Schema>` — the Zod schema becomes the single source of truth |
| Prisma enum casts in repositories / usecases | ~80 | Medium | import the Prisma enum; type the field / interface as the enum, or `as <Enum>` at a genuine string boundary |
| Prisma `Json` column writes | ~15 | Medium | `as Prisma.InputJsonValue` (the real input type) |
| Dynamic Prisma delegate by string key | ~12 | Medium | a bounded `ModelDelegate` interface + `Record<string, ModelDelegate>` adapter |
| Static `(prisma.<model> as any)` | ~10 | Low | the model is generated — drop the cast |
| `unknown`-error narrowing | ~8 | Medium | `instanceof Prisma.PrismaClientKnownRequestError` / `instanceof Error` / a `Record`-probe type guard |
| Raw-SQL / query-result row recasts | ~12 | Low | an explicit row interface, `as RowShape[]` |
| Third-party / UI lib friction | ~15 | Low | the real upstream type, or a `@tanstack` `ColumnMeta` module augmentation |

### Remediation — six disjoint file groups

The 69 files were partitioned into six **disjoint whole-file
groups** so the work could run in parallel without merge conflicts:
repositories · lifecycle + import/export services · evidence
usecases + jobs · API route boundaries · misc usecases · lib +
components. Each group fixed *every* cast in its files, typechecked
in isolation, and produced one commit; the groups were then merged
into a single PR branch.

The API-route group is the architecturally interesting one. Each
route already validates its body with `withValidatedBody(Schema,
handler)`, so `body` is `z.infer<typeof Schema>` — runtime-safe. The
`as any` only bridged a *type* drift between the schema-inferred
shape and each usecase's hand-written inline `data: {...}` param.
The fix retyped the usecase parameter as `z.infer<typeof Schema>`,
making the schema authoritative. That surfaced the real drift the
casts had hidden — `.nullable()` schema fields (`string | null`)
that the usecases had typed `string | undefined` — which then
propagated honestly into two repository signatures.

## Files

| Area | Role |
|------|------|
| `src/app/api/**/route.ts` (16 files) | dropped `body as any`; `body` flows untyped-cast-free into the usecase |
| `src/app-layer/usecases/{audit,clause,evidence,finding,vendor}.ts` | input params retyped to `z.infer<typeof Schema>` (the API contract) |
| `src/app-layer/repositories/*.ts` (12 files) | Prisma enum / `Json` / `WhereInput` typing; `updateChecklistItem` `result: any` → typed `ChecklistResult` boundary |
| `src/app-layer/services/*.ts`, `jobs/*.ts`, `usecases/*.ts` | enum / Json / row-interface / delegate-adapter typing |
| `src/lib/**`, `src/components/ui/**` | error narrowing, `ColumnMeta` augmentation, real upstream types |
| `src/components/ui/table/tanstack-table.d.ts` | NEW — `@tanstack/react-table` `ColumnMeta` module augmentation |
| `tests/guardrails/no-explicit-any-ratchet.test.ts` | `CURRENT_BASELINE` 175 → 4 |
| `tests/guards/no-explicit-any-ratchet.test.ts` | per-pattern caps lowered to the post-cleanup floor |

## Decisions

- **The Zod schema is the source of truth at the API boundary.**
  Retyping a usecase param to `z.infer<typeof Schema>` (rather than
  hand-maintaining a parallel inline type) means the validator and
  the consumer can never drift again — the cast is structurally
  unnecessary, not just removed.

- **Bounded transitional wrappers for genuine dynamic access.**
  Dynamic Prisma model access by string key (`(db as any)[name]`)
  cannot be fully statically typed. Rather than leave `any`, it goes
  through a small named `ModelDelegate` interface listing only the
  methods actually called — narrow, explicit, greppable.

- **`as <Enum>` is an acceptable terminus, `as any` is not.** Where
  a value is genuinely a free string at the cast site (an
  un-revalidated query-string filter), `as WorkItemStatus` is a
  narrow, explicit assertion that Prisma still validates at runtime
  — categorically different from `as any`, which disables checking
  in every direction.

- **Four casts remain — documented staged debt, not oversights.**
  Three in `onboarding/step/route.ts`: removing them surfaced a
  latent bug — the onboarding usecase's local `STEP_ORDER`
  (`ASSETS`/`CONTROLS`/`REVIEW`) diverges from the canonical
  `ONBOARDING_STEPS` (`ASSET_SETUP`/…/`REVIEW_AND_FINISH`), so
  `getNextStep` silently no-ops. Reconciling them changes runtime
  behaviour and is out of a type-safety pass's scope. One in
  `retention-notifications.ts`: `Task.createdByUserId` is non-null
  but a background job has no actor — needs a system-user sentinel.
  Each carries an inline `eslint-disable` + reason.

- **Both ratchets lowered in the same diff.** The binding ratchet's
  drift sentinel (fails if the baseline sits >5 above the real
  count) forces the baseline down to 4 — the gain is locked, it
  cannot silently re-fill.
