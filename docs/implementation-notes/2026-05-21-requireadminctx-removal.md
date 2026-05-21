# 2026-05-21 — Remove the legacy `requireAdminCtx` admin guard

**Commit:** `chore(security): remove dead requireAdminCtx legacy guard + ratchet`

## Design

Epic C.1 introduced `requirePermission(<key>, handler)` as the
permission-key-driven admin guard; Epic D.3 migrated the last
role-tier routes (billing, sso, security) onto it. After D.3 the
legacy `src/lib/auth/require-admin.ts` module — exporting
`requireAdminCtx`, `requireWriteCtx`, `requireRoleCtx` — was kept
"for non-tenant routes and the legacy guardrail's accept list."

A grep showed that justification no longer held: **zero production
call sites.** Every `src/` occurrence was the definition itself or a
doc comment. The `/api/admin/*` non-tenant routes the docstring named
are gated by the platform-admin API key, not by these helpers.

A dead role-tier guard within import reach is a latent hazard —
unlike `requirePermission` it writes no `AUTHZ_DENIED` audit row and
is invisible to `api-permission-coverage.test.ts`. So it was deleted
outright rather than quarantined, and a ratchet now keeps it gone.

## Files

| File | Role |
|---|---|
| `src/lib/auth/require-admin.ts` | **Deleted** — the three dead helpers. |
| `tests/unit/require-admin.test.ts` | **Deleted** — exercised only the deleted module. |
| `tests/guardrails/no-legacy-admin-guard.test.ts` | **New ratchet** — fails CI if the identifiers or `@/lib/auth/require-admin` reappear under `src/`; asserts the module file is gone; carries two detector regression proofs. |
| `src/lib/security/permission-middleware.ts` | Docstring: `requirePermission` is now the *only* admin guard. |
| `tests/guardrails/admin-route-coverage.test.ts` | `ADMIN_GUARD_PATTERNS` narrowed to `['requirePermission']`. |
| `tests/guardrails/enterprise-identity-epic.test.ts` | `ADMIN_GUARDS` regex narrowed to `/requirePermission/`. |
| `CLAUDE.md`, `docs/epic-c-security.md`, `docs/epic-d-completeness.md` | Current-state guidance + rollback runbooks updated; the D.3 "caveat 5" marked resolved. |

## Decisions

- **Delete, not quarantine.** The prompt allowed either. Removal is
  unambiguous: a quarantined helper still type-checks at any new call
  site, so the only durable guarantee is that the symbol cannot be
  imported at all. The ratchet enforces that.
- **Ratchet strips comments before scanning.** Historical mentions of
  the helper name survive in test-file and doc comments (and are
  accurate history); the ratchet scans only executable code under
  `src/` so it bans real usage without forcing comment churn.
- **Historical implementation notes left untouched.** The dated
  `2026-04-23-epic-{c,d}-*.md` notes record what was true then; only
  current-state runbooks (`epic-c-security.md`, `epic-d-completeness.md`)
  and `CLAUDE.md` were corrected.
- **Rollback advice rewritten.** Both runbooks previously told
  operators to "swap back to `requireAdminCtx`" in an incident — now
  impossible. The new advice is `git revert` of the route's
  `requirePermission` wrapping; dropping to unguarded `getTenantCtx`
  remains explicitly forbidden.
