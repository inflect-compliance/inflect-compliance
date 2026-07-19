# 2026-07-19 — Evidence: body field, scorer parity, file versions

**Commit:** `<pending> fix(evidence): thread content end-to-end, unify the coverage predicate, expose file versions`

## Design

### 1. The evidence body was invisible AND un-editable

The schema column is `content`. The UI was wired to `description` — a
field that **does not exist on the model**:

- `EvidenceDetailSheet` rendered `evidence.description`, so the body
  block was dead code that could never display.
- `EditEvidenceModal` seeded from `description` and PUT `description`,
  which `UpdateEvidenceSchema` (`.strip()`) silently discarded. The save
  reported success and changed nothing.

Threading `content` through fixes both — but **not naively**, because
`content` is overloaded three ways:

| type | `content` holds |
| --- | --- |
| TEXT | the note body (prose) |
| LINK | the target URL |
| FILE | the object-storage **pathKey** (`replaceEvidenceFile` sets `content: pathKey`; the posture/scanner writers do too) |

So pointing the sheet and the edit form straight at `content` would have
(a) rendered raw storage paths to users on FILE rows and (b) — worse —
let a save from the generic edit form **detach a FILE row from its
file**, since `updateEvidence` wrote `data.content` unconditionally and
the form always sent the body field.

`src/lib/evidence-content.ts` now owns that per-type meaning
(`evidenceContentRole` / `isEvidenceContentEditable`), and three surfaces
consume it:

- the sheet renders the body as prose for TEXT, as a link for LINK, and
  not at all for FILE;
- the edit form hides the field for FILE and omits `content` from the PUT;
- **`updateEvidence` re-checks server-side** and drops a caller-supplied
  `content` for FILE evidence. The client gate alone would not stop a
  hand-rolled PUT — the API is public.

Unknown/new evidence types default to `internal`, so a future type is
hidden and read-only until someone decides otherwise rather than leaking
whatever its writer put in `content`.

### 2. Three scorers each counted evidence their own way

"Evidence that counts toward coverage" had one definition
(`isCoverageQualifyingEvidence` / `coverageQualifyingEvidenceWhere`:
APPROVED, not archived, not soft-deleted, unexpired) — and three scorers
that ignored it:

- `mapping.ts` — bare `status === 'APPROVED'`, no expiry/archive/delete
  guard at all, **and** its source query (`MappingRepository`) pulled
  soft-deleted evidence in;
- `packs.ts` — status-only;
- `soa.ts` — diverged the *other* way: filtered `deletedAt` but **not
  status**, so DRAFT/REJECTED evidence inflated the per-control tally.

All three now route through the shared predicate, and `MappingRepository`
filters `deletedAt` at the source.

The guard is the more important half. It previously policed only the two
files someone had remembered to list, with **no completeness check** —
which is exactly how these three drifted. It now:

- covers all five scorers;
- uses **evidence-specific** canaries (a blanket `status: { in: [`
  check would false-positive on `packs.ts`, which legitimately filters
  *control* status that way);
- adds an inverse **completeness** check: any file under
  `usecases/`/`repositories/` that queries evidence and qualifies it by
  an APPROVED status of its own must be either a listed scorer or an
  explicitly excused non-scorer (each with a written reason).

That completeness check was mutation-tested — removing a known
non-scorer from the allowlist correctly fails it. An earlier, narrower
canary passed the mutation, i.e. it would NOT have caught the regression
class it exists for.

### 3. File-version lineage was write-only

`replaceEvidenceFile` has always written the chain — each new FileRecord
points at the one it superseded via `previousFileRecordId`, and
`Evidence.fileVersion` counts up — but nothing ever read it back. A user
who replaced a file could see neither that v2 existed nor how to get v1.

`getEvidenceFileVersions` walks the chain (FileRecord carries no
`evidenceId`, so a linked list is the only route; the walk is bounded by
`MAX_FILE_VERSION_CHAIN` and carries the N+1 pragma with that reason).
New route `GET /evidence/[id]/file-versions`; the sheet renders a version
badge plus each prior version with a download.

Prior versions download through the **existing**
`/evidence/files/[fileId]/download` route, which already resolves any
tenant-scoped FileRecord and re-applies the tenant path guard and the AV
scan gate — so history gets the same protections as the head.

## Files

| File | Role |
| --- | --- |
| `src/lib/evidence-content.ts` | **new** — what `content` means per type |
| `src/app-layer/usecases/evidence.ts` | server-side content gate; `getEvidenceFileVersions` |
| `src/app-layer/repositories/EvidenceRepository.ts` | `content` in the list select |
| `.../evidence/EvidenceDetailSheet.tsx` | body render per role; version panel |
| `.../evidence/EditEvidenceModal.tsx` | seed/submit `content`, gated by type |
| `mapping.ts` · `packs.ts` · `soa.ts` · `MappingRepository.ts` | routed through the shared predicate |
| `tests/guards/coverage-evidence-predicate.test.ts` | widened + completeness check |
| `.../evidence/[id]/file-versions/route.ts` | **new** route |
| `tests/integration/db-helper.ts` | probe timeout 5s → 30s (see below) |

## Decisions

- **Keep the column name `content`, add a role helper.** A new
  `description` column was the alternative. But `content` already holds
  the TEXT body — the field the user actually wants to see — so a second
  column would have meant a migration plus an ambiguous "which one is the
  body?" for every future reader. The overload is real but it is
  *type-determined*, which a helper models cleanly.
- **Gate `content` server-side, not just in the form.** The pathKey is a
  storage pointer; a public PUT must not be able to write it.
- **Widen the guard AND add completeness.** Listing three more files
  fixes today; the inverse check is what stops the next drift.
- **Bumped the integration DB probe timeout.** Unrelated to evidence, but
  found while verifying: the 5s probe takes ~6s on a loaded machine, so
  **every** integration suite silently skipped — 37 evidence tests
  included. Tests that appear to pass while never running are worse than
  failing ones. Erring long can only run more tests.
