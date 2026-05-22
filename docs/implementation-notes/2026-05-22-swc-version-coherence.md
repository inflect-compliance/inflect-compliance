# 2026-05-22 — Next.js SWC version-coherence guard

**Commit:** `<pending> test(guards): lock @next/swc-* version coherence with next`

## Design

The first prompt of the dependency-governance roadmap targeted a
described `@next/swc-*` version skew — `@next/swc-linux-arm64-musl`
pinned `16.2.6` while the other platform packages were pinned
`14.2.35`, against `next@16.2.6`.

**That skew was already fixed.** PR #615 (the CI/CD roadmap's
deterministic-installs work, earlier this session) found the exact
stale `optionalDependencies` block in `package.json` and removed it
in full — a consumer project must never pin `next`'s own transitive
`@next/swc-*` packages; `next` resolves them itself, all at its own
version. Verified on `main`: `package.json` has no
`optionalDependencies` key, and all eight `@next/swc-*` lockfile
entries are `16.2.6`, matching `next`.

What was still missing is the prompt's requirement #7 — "add checks
so this mismatch cannot quietly return." This change supplies that:
`tests/guards/swc-version-coherence.test.ts`, a structural ratchet
that fails CI on either re-introduction mechanism —

1. **`package.json` pinning `@next/swc-*` directly** (in
   `dependencies` / `devDependencies` / `optionalDependencies`) —
   the exact mechanism that produced the original skew.
2. **A lockfile `@next/swc-*` entry whose version differs from
   `next`'s** — catches a partial pin, a stale hand-edit, or any
   other source of skew, regardless of how it arose.

It also carries an in-test regression proof that a simulated skewed
entry is detected, and a vacuity guard (the lockfile genuinely
contains SWC entries).

## Files

| File | Role |
|------|------|
| `tests/guards/swc-version-coherence.test.ts` | NEW — fails CI on any `@next/swc-*` pin or lockfile version skew vs `next`. |
| `docs/dependency-policy.md` | The `@next/swc-*` worked example now references the new guard. |

## Decisions

- **A guard, not a re-fix.** The skew itself was already resolved in
  #615. P1's genuine value is the structural lock so the same
  Next-major-bump footgun (forgetting to update pinned SWC packages)
  cannot recur — caught at PR time, not discovered as a
  cross-platform build difference later.

- **Check the lockfile version equality, not just the absence of a
  pin.** Banning the `package.json` pin closes the known mechanism;
  asserting every lockfile `@next/swc-*` equals `next`'s version
  closes ALL mechanisms — it is a direct statement of the property
  that matters (every platform builds with SWC matching `next`),
  independent of how a skew might be introduced.

- **Standalone guard file.** SWC coherence is a distinct concern
  from `deterministic-install.test.ts` (npm ci + Node policy). A
  focused file keeps each guardrail single-purpose and gives the
  dependency-governance capstone (Roadmap-5 P3) a discrete entry to
  register.
