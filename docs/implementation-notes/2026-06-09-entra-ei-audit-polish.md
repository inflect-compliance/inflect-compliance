# 2026-06-09 — Entra integration audit & polish

**Commit:** `<sha>` chore(auth): Entra integration audit/polish (EI-1..EI-4 follow-up)

## Why

A review pass over the now-complete Entra integration (EI-1 claims, EI-2 mapping
config, EI-3 enforcement, EI-4 observability/test-infra) before calling it done.
Findings below; the misfires from the review (mutation routes "lack
rate-limiting" — they get `API_MUTATION_LIMIT` via `withApiErrorHandling`; the
`take: 500` list cap is not an RLS bypass) were discarded.

## Findings fixed

**P1 — `token.aadGroups` cookie bloat (correctness).** EI-1 persisted the full
AAD group list on the JWT "for the EI-2 mapper", but EI-3 consumes the groups
**in-callback** via the local variable — nothing ever reads `token.aadGroups`,
and the session callback doesn't expose it. For the >200-group overage
population the field is hundreds of GUIDs (~7KB+), bloating/chunking the cookie
for zero readers. **Fix:** stop persisting the array; keep only the bounded
`aadGroupsOverage` flag. EI-1 guard updated to assert the array is no longer set.

**P1 — directoryRole leak in the overage Graph fetch (correctness).**
`/me/memberOf` is heterogeneous (groups + directoryRoles + administrativeUnits);
`fetchUserGroupsFromGraph` kept every object with an `id`, so directory-role ids
leaked into the resolved group list (and the code comment wrongly claimed they
were "filtered out by the id presence guard"). **Fix:** use the typed
`/me/memberOf/microsoft.graph.group` cast so Graph returns groups only —
server-side, no fragile client `@odata.type` guess. Fixture + comment updated.

**P1 — `groupClaimMode: 'applicationRole'` configurable but unimplemented
(false sense of security).** The resolver only reads the `groups` claim; App
Roles were never wired, yet the admin UI offered the toggle. **Fix:** remove the
UI toggle (lock to Security groups); the enum value stays for stored-config
back-compat with a `RESERVED, not implemented` schema comment + docs note.

**P2 — gaps.** UPDATE audit now records `aadGroupName` (not just role/priority);
the `enforceGroupGate` UI hint now explains the no-mappings no-op; the role
Combobox carries an "OWNER is granted manually" hint; the delete undo-toast now
checks the HTTP response (rolls back + surfaces an error on failure) and the add
form maps 403 → "Access denied".

**P3 — operator docs.** `docs/enterprise-sso.md` gains a "group → role mapping"
section: how sync works, the resolution algorithm (priority → seniority → id),
the gate (incl. the no-mappings caveat), the claim-mode limitation, and the
audit/metrics surfaces.

## Deferred (with reasons)

- **Real-capture fixtures.** The `tests/fixtures/entra/*.json` are still seeded
  from Microsoft's documented shapes; swap in a redacted live capture when a
  staging/prod work account can return `/me/memberOf` groups (the parse-through
  test already guards the shape).
- **Application Roles** — implementing the `roles`-claim path is a feature, not
  polish; reserved until a tenant needs it (mappings would also need non-GUID
  identifiers).
- **`(tenantId, priority)` composite index** — the current `@@index([tenantId])`
  + in-memory sort of a handful of mappings is fine; revisit only if a tenant
  accumulates thousands of mappings.

## Files

| File | Change |
| --- | --- |
| `src/auth.ts` | Stop persisting `token.aadGroups`; augmentation trimmed to the overage flag. |
| `src/lib/auth/entra-graph.ts` | Typed `microsoft.graph.group` memberOf endpoint + corrected comment. |
| `src/app-layer/schemas/entra-provider.schemas.ts` | `applicationRole` marked reserved/unimplemented. |
| `src/app/t/[tenantSlug]/(app)/admin/entra/page.tsx` | Remove claim-mode toggle; clarify gate hint. |
| `src/app/.../admin/entra/GroupMappingsSection.tsx` | Delete error handling, role hint, 403 message. |
| `src/app-layer/usecases/entra-group-mappings.ts` | UPDATE audit includes `aadGroupName`. |
| `tests/fixtures/entra/memberOf-page.json` + test | Groups-only (typed endpoint) shape. |
| `tests/guards/entra-ei1-group-claims.test.ts` | Assert the array is no longer persisted. |
| `docs/enterprise-sso.md` | Operator section for group → role mapping. |
