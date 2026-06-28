# 2026-06-28 — Public Trust Center

**Commit:** _(pending)_ `feat(trust-center): public curated compliance posture page`

> **SECURITY-REVIEW GATE:** this PR adds the first intentionally-public,
> unauthenticated, indexable surface to an otherwise auth+RLS-locked
> multi-tenant app. It MUST carry a named security-review sign-off in the PR
> before merge (non-negotiable). The design below is built so the review has a
> small, well-defined surface to reason about.

## Why

A Trust Center is a recognised GRC feature (Vanta / Drata / SafeBase) with
direct sales value: a prospect sees your security posture without an NDA or a
sales call. The concept was surfaced by `eb-sec/Govrix` (MIT); **no Govrix
code was ported** (vanilla-JS, single-tenant). This is native to Inflect and
its only differentiator vs. a static marketing page is that it plugs into the
tenant's curated compliance claims — while leaking nothing else.

## The security model — allowlist publish, not "dashboard minus auth"

The load-bearing principle: **the public page renders an EXPLICIT, curated
projection the tenant composes — never a live view of tenant data.** Every
control below exists to make a one-field leak impossible, not unlikely.

1. **A dedicated projection table (`TrustCenter`).** The public page reads ONE
   row from ONE table. It NEVER queries Risk/Control/Evidence/Finding/etc.
   There is no code path from the public page to any other tenant table.
2. **Import isolation (the leak-prevention lock).** The public route
   (`src/app/trust/[slug]/page.tsx`) → `src/lib/trust-center/public.ts` →
   `@/lib/prisma`. That's the entire reachable graph.
   `tests/guardrails/trust-center-coverage.test.ts` walks the route's FULL
   transitive import graph and fails CI if it reaches ANY
   `src/app-layer/usecases/*` (except trust-center) or
   `src/app-layer/repositories/*`. A future refactor that imports a tenant
   usecase into the public page breaks the build.
3. **Explicit field allowlist on the read.** `getPublicTrustCenter` uses a
   Prisma `select` listing only publishable fields — `tenantId`, `id`,
   `enabled`, `publishedByUserId`, and every relation are never selected, so
   they cannot serialise into the page. The integration test asserts the
   returned object's keys are EXACTLY the allowlist and that the serialised
   payload contains none of the tenant's real risk/control data.
4. **Off by default.** `enabled` defaults `false`. A tenant has no public page
   until an OWNER explicitly publishes one.
5. **Publish is OWNER-gated + audited.** Enable/disable goes through
   `requirePermission('admin.tenant_lifecycle')` (OWNER-only) and writes
   `TRUST_CENTER_PUBLISHED` / `TRUST_CENTER_UNPUBLISHED`. The usecase
   re-asserts OWNER (defence in depth). Editing content while published also
   audits (`TRUST_CENTER_UPDATED`).
6. **Sanitised + scheme-restricted.** All free text runs through
   `sanitizePlainText` before persistence (public XSS surface); document URLs
   are restricted to `http(s)` (drops `javascript:`/`data:` vectors).
7. **404, never 403.** A missing OR disabled slug returns `notFound()` — we
   never disclose that a tenant exists.
8. **Edge rate-limited.** `/trust/<slug>` is rate-limited in the middleware
   (per-IP + per-slug) BEFORE the public-path allow, reusing the GAP-17 edge
   limiter — it's public, so a scraping/DoS target.

## Why the public read bypasses RLS (and why that's safe)

`TrustCenter` carries `tenantId`, so it's RLS-covered for the AUTHENTICATED
compose path (`runInTenantContext`). The PUBLIC read runs through the prisma
singleton WITHOUT a tenant context — under the table-owner role the
`superuser_bypass` policy applies, resolving the single curated row by its
public `slug`. This is intentional and safe because (a) the read is filtered
to `enabled: true`, (b) it selects only the allowlist, and (c) the import-
isolation lock guarantees no other table is reachable from that page.

## Compose surface

`/t/<slug>/admin/trust-center` — ADMIN-tier compose (display name, tagline,
frameworks-to-show with tenant-set status labels, posture prose, documents,
security contact, index toggle) with a LIVE PREVIEW of exactly what the public
sees, and an OWNER-only Publish button behind a typed confirm
("This page will be publicly accessible…").

## Files

| File | Role |
|------|------|
| `prisma/schema/compliance.prisma` | `TrustCenter` model (projection, enabled=false) |
| `prisma/migrations/20260628140000_trust_center/` | Table + indexes + RLS |
| `src/lib/auth/guard.ts` | `/trust/` added to the public-path allowlist (commented) |
| `src/middleware.ts` | `/trust/` edge rate-limit branch (before public allow) |
| `src/lib/trust-center/public.ts` | The ONLY public read — single curated row, import-isolated |
| `src/app/trust/[slug]/page.tsx` | Public page — reads only the projection; 404 on missing/disabled; per-tenant robots |
| `src/app-layer/usecases/trust-center.ts` | Compose + OWNER-gated audited publish toggle; sanitises all free text |
| `src/lib/security/route-permissions.ts` | `/enable` → OWNER, compose → ADMIN (enable rule first, first-match-wins) |
| `src/app/api/t/[tenantSlug]/admin/trust-center/**` | Compose (PUT) + enable (POST) routes |
| `src/app/t/[tenantSlug]/(app)/admin/trust-center/**` | Compose UI + live preview + confirm-gated publish |
| `tests/guardrails/trust-center-coverage.test.ts` | The security ratchet (import isolation, allowlist, rate-limit, OWNER-gate, audit, sanitise, 404) |
| `tests/integration/trust-center-public-leak.test.ts` | DB-backed leak-proof: seeds real risk/control data, asserts none leaks |

## Decisions

- **Curated snapshot, never a live posture mirror.** Status labels are set by
  the tenant, not derived from coverage % — auto-deriving public numbers is
  exactly the leak risk this design refuses.
- **A new table, not a view over the dashboard.** "Expose the dashboard minus
  auth" is the anti-pattern; an explicit projection makes the publish boundary
  a real security control, not a UI toggle.
- **publishedByUserId is a plain column (no relation).** Keeps the public read
  graph minimal — one table, no joins, nothing to accidentally select.
- **This is the PUBLIC tier only.** An NDA-gated document room and an uptime
  status page are different features, explicitly out of scope.
