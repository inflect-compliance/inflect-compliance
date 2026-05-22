<!--
  Keep this short. Describe the change and why. Delete any section
  that does not apply — the dependency checklist in particular is
  only relevant when package.json / package-lock.json changed.
-->

## What & why

<!-- One or two sentences: what this PR changes and the reason. -->

## Dependency changes

<!--
  DELETE THIS WHOLE SECTION if package.json / package-lock.json are
  untouched. If they changed, confirm the governance checklist —
  see docs/dependency-governance.md.
-->

- [ ] New runtime package is in `dependencies`; build/test-only in `devDependencies`.
- [ ] `package-lock.json` is committed and was produced by a normal `npm install` (no `--legacy-peer-deps`).
- [ ] Any new `overrides` entry is documented in `docs/dependency-policy.md` (bridge vs security override).
- [ ] A CVE-active / untrusted-input package is reviewed in `docs/dependency-risk-review.md` + its `REVIEWED` guard entry.
- [ ] A major bump updates any guardrail that pinned the old major in the same PR.

## Verification

<!-- What you ran: typecheck, the affected test suites, the build. -->
