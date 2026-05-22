# Dependency governance

The single entry point for how this repo manages its dependency
graph. It ties together the install-time policy
(`dependency-policy.md`), the periodic risk review
(`dependency-risk-review.md`), and the structural guardrails that
enforce both — and states the contributor workflow for changing a
dependency.

The goal is a dependency posture that is **explicit, deterministic,
secure, and resistant to silent drift**. Every rule below is backed
by a CI guardrail, so the safe path is the default path and a
regression fails at PR time rather than being discovered in
production.

## The four governance pillars

| Pillar | What it guarantees | Enforced by |
|--------|--------------------|-------------|
| **Deterministic installs** | Every install path runs `npm ci` against a locked tree, on a pinned Node major. Two runs of one commit produce an identical `node_modules`. | `tests/guards/deterministic-install.test.ts` |
| **Strict peer resolution** | No `--legacy-peer-deps` anywhere. npm validates the peer graph on every install; an incompatible package fails fast. Accepted mismatches are named individually in the `overrides` block. | `tests/guards/no-legacy-peer-deps.test.ts` |
| **Framework version coherence** | `next` owns its own `@next/swc-*` platform binaries — the consumer never pins them. Every `@next/swc-*` lockfile entry tracks the resolved `next` version, so all platforms build with matching SWC. | `tests/guards/swc-version-coherence.test.ts` |
| **Reviewed runtime risk** | Dependencies with CVE-active history or a large blast radius are reviewed package-by-package; the review verdict (section + major floor) is locked. | `tests/guards/dependency-risk-review.test.ts` |

A fifth, narrower lock — the **auth-stack pin** — keeps `next-auth`
on its reviewed major (see the NextAuth policy below):
`tests/guardrails/auth-stack-pinning.test.ts`.

All five are themselves guarded by the meta-ratchet
`tests/guards/dependency-governance-integrity.test.ts` — a
contributor who deletes or guts any one of them meets a red
"guard the guards" test.

## The dependency lifecycle — contributor workflow

### Adding a dependency

1. **Justify the runtime role.** Does it ship in the production
   image, or is it build/test only? That answer decides the
   `package.json` section — `dependencies` vs `devDependencies`. Get
   it right the first time: the `Dockerfile` runs
   `npm prune --omit=dev`, so a runtime package wrongly in
   `devDependencies` is stripped from the image and crashes in
   production where CI cannot see it.
2. **Install with `npm install <pkg>` locally**, then commit the
   `package-lock.json` change. CI runs `npm ci` — it will reject a
   lockfile that drifts from `package.json`.
3. **Strict peers must pass.** If the install reports a peer
   conflict, do **not** reach for `--legacy-peer-deps`. Either pick
   a compatible version, or — if the mismatch is genuinely safe —
   add a *granular* `overrides` entry and document why in
   `dependency-policy.md`.
4. **If the package parses untrusted input, handles credentials, or
   has a CVE-active ecosystem**, review it: add a section to
   `dependency-risk-review.md` and an entry to the `REVIEWED` map in
   `dependency-risk-review.test.ts`, in the same PR.

### Upgrading a dependency

- **In-major bumps** (patch/minor) are free — the caret range
  already allows them and `npm ci` locks the exact resolved
  version.
- **Major bumps** are a deliberate review. Read the changelog for
  breaking changes, run the affected test suites, and update any
  guardrail that pins the old major (`dependency-risk-review.test.ts`
  for a reviewed package, `auth-stack-pinning.test.ts` for
  `next-auth`) in the same PR.
- **Never** run `npm audit fix --force` — it resolves advisories by
  downgrading or cross-grading packages with no regard for the
  codebase. Fix a transitive CVE with a targeted `overrides` entry
  instead (see "Security overrides" in `dependency-policy.md`).

### Removing a dependency

- Confirm zero import sites with an exhaustive grep across `src/**`,
  `next.config.js`, `src/instrumentation.ts`, and dynamic
  `import()` / `require()` before deleting it.
- A risk review **never** removes a package — reclassification and
  removal are separate, deliberate changes.

## The `overrides` block — two kinds, one rule

`package.json` carries an `overrides` block. Every entry is one of
two kinds, and both are documented in `dependency-policy.md`:

- **Bridge override** — a peer range that has not yet caught up to a
  version we run (e.g. `@visx/*` peering `react ^18` while we run
  `react@19`). A bridge is temporary: drop it when upstream ships a
  release whose peer range genuinely includes our version.
- **Security override** — forces a *patched* transitive dependency
  when an advisory lands against a version pulled in by a package we
  don't control (e.g. `uuid → ^11.1.1`). A security override is
  **not** a convenience bridge — keep it until the upstream package
  itself depends on a patched range.

The rule that unites them: an override names *exactly* which
mismatch is accepted and why. It is the precise opposite of the
blanket `--legacy-peer-deps` — every *other* package's peers stay
strictly validated.

## NextAuth — stay on v4 until 5.0.0 GA

`next-auth` is pinned to **`4.24.14`** (exact, no caret) and the
v4-era `@next-auth/prisma-adapter`. This is a deliberate, reviewed
decision, not lag:

- **NextAuth v5 has no stable release.** As of 2026-05-22 the v5
  line is beta-only (`5.0.0-beta.x`); npm's `latest` dist-tag still
  points at `4.24.14`. v4 is the supported stable line.
- **The audit's GAP-04** found the production auth layer briefly
  running on `next-auth@5.0.0-beta.30`, whose type drift forced
  `as any` casts into the auth-critical path. Commit `4de1988`
  migrated back to v4 stable and removed those casts.
- `auth-stack-pinning.test.ts` locks the post-migration state:
  `next-auth` must be an exact `4.x.x` (no caret, no `beta` / `rc` /
  `canary` suffix), the adapter must be `@next-auth/prisma-adapter`
  (not the v5 `@auth/prisma-adapter`), and the v5-only
  `auth.config.ts` must not return.

**Recheck cadence:** when `next-auth`'s `latest` dist-tag advances to
a real `5.x.x` GA, schedule the migration as its own project —
update `auth-stack-pinning.test.ts` and this section in the same PR.
Until then, a slip back to a beta build fails CI. The v4 pin is
correct; the guardrail keeps it from eroding by accident.

## The CI surface

The `Security` job in `.github/workflows/ci.yml` is the runtime
enforcement layer the guardrails complement:

- **`dependency-review-action`** (PR-only) — flags a newly
  introduced dependency that carries a known advisory, before it
  merges.
- **`npm audit --omit=dev --audit-level=moderate`** — **blocking**.
  A MODERATE+ advisory in the production dependency tree fails the
  merge. Its strictness is itself ratcheted by
  `tests/guardrails/security-gate-strictness.test.ts`.
- **`npm audit` (all deps)** — informational; surfaces dev-tree
  advisories as a warning without blocking.

Structural guardrails catch *drift* (a re-introduced flag, a version
skew, a misclassified package); the `Security` job catches *new
advisories*. Both layers are load-bearing.

## See also

- `docs/dependency-policy.md` — install-time policy: strict peers,
  `npm ci`, the `overrides` table, Node/npm pinning.
- `docs/dependency-risk-review.md` — the package-by-package risk
  review and the reusable audit template.
