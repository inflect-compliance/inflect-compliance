# Test portfolio model

This document is the **portfolio** policy for the test suite — what
each test layer is *for*, the balance to aim for, and the one rule
that holds the whole thing together:

> **A structural ratchet is never a substitute for a behavioural test
> of the same logic.**

It is the companion to `docs/coverage-policy.md`. The coverage policy
answers *"how much of the code must be exercised, per risk tier."*
This document answers *"by which kind of test, and why."*

## The six layers

The suite has six test directories. They are not interchangeable —
each verifies a different thing, and a healthy suite uses all six for
the jobs they are good at.

| Layer | Directory | Verifies | Runtime cost | Count today |
|-------|-----------|----------|--------------|-------------|
| **Structural guard** | `tests/guards/` | A code *shape* — a string, symbol, import, or AST pattern is present / absent across the tree. | Very low (regex / fs scan) | ~325 |
| **Structural guardrail** | `tests/guardrails/` | Same as guards — architectural ratchets (RLS coverage, permission coverage, schema indexes). | Low (some DB-backed) | ~62 |
| **Unit** | `tests/unit/` | Real input→output / branch / error behaviour of a function or module, dependencies mocked. | Low | ~432 |
| **Integration** | `tests/integration/` | Behaviour against a real Postgres — repository queries, RLS enforcement, transactions. | Medium | ~102 |
| **Rendered** | `tests/rendered/` | A React component renders the right DOM for given props / state. | Medium | ~122 |
| **E2E** | `tests/e2e/` | A user-visible flow works end to end in a real browser. | High | ~36 |

### What each layer is FOR

**Structural guard / guardrail** — *prevent a known regression class
from re-entering the tree.* A guard asserts a fact about the **shape**
of the code: "every tenant table has an RLS policy", "no route uses
the legacy `requireAdminCtx`", "every password route imports
`checkPasswordAgainstHIBP`". Guards are cheap, fast, and run on the
whole tree. They are the right tool when the risk is *"someone adds a
new file and forgets the cross-cutting rule."*

What a guard **cannot** do: tell you the code is *correct*. A guard
that asserts `resolveDueItemOwner` *exists and is exported* says
nothing about whether it returns the right user id for a `TASK`
versus a `CONTROL`. That is a behavioural question — and only a
behavioural test answers it.

**Unit** — *verify decision logic.* Branches, transformations, error
paths, state machines. This is where the product's correctness lives.
A unit test feeds a real input, asserts the real output, and takes
every `else`. For a compliance platform, the branch that wrongly
grants access / skips a validation / mishandles an invalid transition
is the one a unit test exists to catch.

**Integration** — *verify the database contract.* RLS isolation,
tenant scoping, hash-chain integrity, conditional-update claims.
Anything whose correctness depends on Postgres behaviour (a trigger,
a policy, a unique constraint) must be tested against a real DB —
mocking Prisma would only test the mock.

**Rendered** — *verify component output.* The right DOM, the right
ARIA, the right empty/error/loading chrome for given props.

**E2E** — *verify the seams.* That the layers, wired together in a
real browser against a real server, actually produce the flow a user
sees. Expensive, so reserved for the critical journeys.

## The balance to aim for

Raw file counts are a weak signal — many `tests/guards/` files are
single-assertion ratchets, and a repo can look "well-guarded" while
behaviour-heavy code lacks real coverage. The portfolio target is
about **verification value**, not file count:

- **Behaviour-heavy code** (usecases, services, domain logic, libs
  with decision logic, transformations, state machines) must have
  **real unit and/or integration coverage**. The per-folder coverage
  floors in `jest.thresholds.json` enforce this for `usecases/` and
  `lib/`; the `coverage-ratchet.test.ts` floor stops them slipping.
- **Structural guards exist to SUPPORT that functional core**, not
  to substitute for it. A guard is the right tool for a cross-cutting
  invariant ("every new route must…"). It is the wrong tool — and a
  false sense of safety — when used as the *only* test for a function
  that makes decisions.
- A rough sanity check: every behaviour-heavy module should be
  reachable from a `tests/unit/` or `tests/integration/` file that
  makes **behavioural assertions** about it. If the only test that
  mentions a decision-making function is a `tests/guards/` scan,
  that is a gap, not coverage.

## The substitution smell

The anti-pattern this document exists to name:

> A `tests/guards/` ratchet asserts *"function X exists / imports Y /
> matches regex Z"* — and there is **no** `tests/unit/` or
> `tests/integration/` test that exercises X's behaviour.

That is a structural test **standing in for** a functional one. The
guard will stay green while X silently returns the wrong answer.

When you find this smell, the fix is **additive**: write the
behavioural test. **Do not delete the guard** — it still does its job
(catching a future *new* call site that forgets the pattern). Guards
and functional tests are complementary: the guard locks the *shape*,
the unit test locks the *behaviour*. You need both.

## Decision tree — which layer for a new test?

```
Is the thing you want to protect a code SHAPE
(a pattern that must hold across many/future files)?
        │
        ├─ yes ──▶ tests/guards/ or tests/guardrails/
        │          (AND, if the shape wraps real logic,
        │           ALSO a unit/integration test of that logic)
        │
        └─ no ──▶ Does correctness depend on the database
                  (RLS, triggers, constraints, transactions)?
                        │
                        ├─ yes ──▶ tests/integration/
                        │
                        └─ no ──▶ Is it a React component's DOM output?
                                        │
                                        ├─ yes ──▶ tests/rendered/
                                        │
                                        └─ no ──▶ Is it a whole user
                                                  journey across layers?
                                                        │
                                                        ├─ yes ─▶ tests/e2e/
                                                        │
                                                        └─ no ──▶ tests/unit/
                                                                  (the default for
                                                                   decision logic)
```

## Reporting helper

`scripts/test-portfolio-report.ts` prints a one-screen snapshot of
the portfolio — file count per layer and the guard-to-functional
ratio. It is a diagnostic aid, not a gate: run it when you want to
sanity-check the balance, e.g. before a test-focused PR.

```bash
npx tsx scripts/test-portfolio-report.ts
```

It deliberately does **not** assert anything — turning the ratio into
a CI gate would invite gaming (delete a guard to "improve" the
ratio). The real gates are the coverage floors in
`jest.thresholds.json` plus the individual structural ratchets. This
helper just makes the shape visible.
