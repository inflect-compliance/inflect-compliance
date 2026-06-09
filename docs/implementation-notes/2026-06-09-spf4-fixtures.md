# 2026-06-09 — SharePoint Graph fixtures + parse-through test (SP-F4)

**Commit:** `<sha>` test(integrations): SharePoint Graph fixtures + parse-through (SP-F4)

Closes the "real-Graph fixture capture" follow-up — the shippable form, since a
live SharePoint tenant isn't available in CI (mirrors the EI fixture decision).

## What

- `tests/fixtures/sharepoint/{sites,site-drives,children,delta,driveitem}.json` —
  **documented-shape** Microsoft Graph responses (synthetic IDs/eTags/URLs, no
  real tenant data; each carries a `_comment` saying so).
- `tests/unit/sharepoint-fixtures-parse.test.ts` — feeds each fixture as the
  mocked Graph response and drives the **real** `SharePointClient` parsers
  (`listSites` / `listDrives` / `listChildren` / `getDelta` / `getItem`),
  asserting the parsed shape (folder vs file, `cTag`/`eTag`, delta token,
  nextLink, parentReference).

## Why this form

A live tenant capture isn't available in CI (same constraint as EI). The fixtures
are documented-not-captured, but the parse-through test means: when someone later
drops a **redacted real capture** over a fixture and Graph's shape has drifted
from what the parser expects, the assertion fails here — turning "we think we
parse Graph correctly" into a checked invariant.

## Files

| File | Role |
| --- | --- |
| `tests/fixtures/sharepoint/*.json` | Documented Graph response shapes. |
| `tests/unit/sharepoint-fixtures-parse.test.ts` | Parser drift lock. |
