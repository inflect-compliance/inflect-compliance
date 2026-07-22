# Licensing

Inflect Compliance is **source-available**, licensed under the
**Business Source License 1.1 (BUSL-1.1)**. The full terms are in
[`LICENSE`](./LICENSE); this page is a plain-language summary — the `LICENSE`
file always governs.

## What you can do

- **Read, fork, modify, and self-host** the source freely.
- **Run it in production for your own organization's compliance program** —
  including via consultants or service providers acting solely on your behalf.
- **Contribute** back (see [`CONTRIBUTING.md`](./CONTRIBUTING.md)).

## What you can't do (without a commercial license)

- Offer the Licensed Work to third parties as a **hosted, managed, embedded,
  or SaaS** compliance / governance / risk / audit-management product or
  service that **competes** with an Inflect offering.

If your intended use falls outside the grant above, contact **ivo@inflect.bg**
for a commercial license.

## It becomes open source over time

BUSL is not an open-source license, but it converts to one automatically.
Each released version relicenses to the **Apache License, Version 2.0** on its
**Change Date** — four years after that version was first made publicly
available. So today's code is Apache-2.0 by 2030-07-17, and every subsequent
release opens on its own four-year clock.

## Why BUSL (not MIT/Apache today, not closed)

The source is open for transparency, self-hosting, and audit — important for a
compliance product — while the four-year commercial window funds the work and
prevents a competitor from reselling it as a rival hosted service before it
opens. GitHub will **not** display an open-source badge for this repo; that is
expected and correct (BUSL is source-available, not OSI-approved open source).

## Third-party components

The dependency tree is permissive-first. A few components carry weaker
obligations — libvips (LGPL, loaded as a separate runtime library), elkjs
(EPL-2.0, file-level), and build-time tools under FSL — none of which affect
your rights to Inflect's own code. Reused third-party content (mappings,
identifiers) is tracked in [`docs/attributions.md`](./docs/attributions.md).
A CI gate (`npm run license:check`) fails the build if a network-copyleft or
non-compete dependency license (AGPL, SSPL, BUSL, Commons Clause) is ever
introduced.
