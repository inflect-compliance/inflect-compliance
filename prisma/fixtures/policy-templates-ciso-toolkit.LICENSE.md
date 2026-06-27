# ciso-toolkit policy templates — attribution & licence

`policy-templates-ciso-toolkit.json` in this folder is **imported
third-party content** (15 ISMS policy documents), not original work. Its
licence is independent of the repository's own and **must travel with the
content** + be surfaced in the template-picker UI.

## Source

- **Project:** ciso-toolkit
- **Repository:** https://github.com/D4d0/ciso-toolkit
- **Pinned version:** `97cb39cfb7c0179bddc065ed19dbb8012e290a05`
- **Files imported:** `policies/POL-00 … POL-14` (15 markdown policies)
- **Imported on:** 2026-06-27

## Licence — MIT

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

MIT permits commercial use, modification, and redistribution **provided the
copyright + permission notice travel with the content**. We satisfy that by
(a) retaining this file, (b) stamping `source`/`sourceLicense` on every
imported `PolicyTemplate` row, and (c) rendering "Adapted from ciso-toolkit
(MIT)" on toolkit-sourced templates in the picker UI.

## Required attribution

> Policy templates adapted from ciso-toolkit
> (https://github.com/D4d0/ciso-toolkit), licensed under the MIT License.

## What we changed at import

- Stripped the YAML frontmatter (doc metadata) — the prose body is the value.
- Replaced toolkit-internal cross-file links (`[text](../standards-…)`) with
  plain text — they don't resolve inside Inflect Compliance.
- Mapped each policy to an IC `category` + framework `tags`
  (`iso27001,nis2,<domain>`). The substantive prose is unmodified.

## Re-syncing

This file + the JSON are a **pinned snapshot**, vendored deliberately so the
seed/build is hermetic. To pull a newer upstream version, bump `PINNED_SHA`
in `scripts/sync-ciso-toolkit-policies.ts` and run
`npx tsx scripts/sync-ciso-toolkit-policies.ts`. Re-syncing is an operator
decision, never automatic — adopted policy content is compliance-load-bearing.
