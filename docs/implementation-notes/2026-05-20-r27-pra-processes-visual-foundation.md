# 2026-05-20 — Roadmap-27 PR-A — Processes visual foundation

**Commit:** `<pending> feat(processes): R27-PR-A — visual foundation (palette · containers · atmosphere)`

Bundles Roadmap-27 prompts 1 (palette / tonal hierarchy), 2
(container architecture) and 5 (background atmosphere) — they are
one visual system and cannot be resolved apart.

## Design

### Diagnosis

The R25/R26 Processes page was flat blue-on-blue. The page shell,
the canvas, the chrome strips and the nodes were all near-identical
navies (`--bg-page` → `--bg-default` at varying opacity). There was
no recessed work plane, no elevated frame, no tonal layering — it
read as "a graph inside a faintly-tinted box".

### New surface ramp — `--canvas-*` token family

A dedicated token family (`src/styles/tokens.css`, both themes;
exposed via the Tailwind `canvas` colour group). Tonal separation,
not hue noise — every value stays inside the METRO navy family.

```
dark depth ramp:   canvas-surface  <  bg-page  <  canvas-frame  <  canvas-node
                   (recessed pit)    (shell)     (raised frame)   (elevated card)
```

| Token | Dark | Role |
|---|---|---|
| `--canvas-surface` | `#05121F` | recessed work plane — deepest |
| `--canvas-frame` | `#0A2138` | workspace frame + chrome strips |
| `--canvas-grid` | `rgba(127,167,215,.10)` | dot grid |
| `--canvas-node` | `#123A60` | elevated flow-node fill |
| `--canvas-node-muted` | `#0D2A45` | quieter context-node fill |
| `--canvas-border` | `rgba(127,167,215,.20)` | hairlines inside the workspace |
| `--canvas-shadow` | (box-shadow) | elevated-node lift |
| `--canvas-recess` | (inset box-shadow) | top inner shadow on the plane |

### Container architecture

`page → workspace frame → { chrome zone, recessed canvas plane, inspector }`

- **Workspace frame** — the `WorkspaceShell.Body`: an elevated
  `rounded-lg` panel, `bg-canvas-frame`, `border-canvas-border`,
  `shadow-lg`, `overflow-hidden` so every inner strip clips to its
  corners. One deliberate container, not a stack of loose bands.
- **Chrome zone** — toolbar row (metadata + doc actions) + palette
  row + help strip. All inherit the frame surface; `--canvas-border`
  hairlines divide them, so they read as one cohesive zone.
- **Canvas plane** — `bg-canvas-surface` + `shadow-canvas-recess`
  (a top inner shadow). The distinct deep tone + the inset shadow
  make it read as sunk below the chrome. This IS the "working
  plane" — no literal inner box (that would fight pan/zoom).
- **Inspector** — right panel, `bg-canvas-frame` (chrome), widened
  to 260px with `p-default` rhythm.

### Nodes — solid elevated cards

The old translucent `bg-bg-default/{60,90} backdrop-blur-sm` fills
became opaque cards: `bg-canvas-node` (flow) / `bg-canvas-node-muted`
(context) + `shadow-canvas-node`. Opaque + shadowed reads as a
deliberate object floating above the recessed plane. Annotation
stays a flat sticker. Selected state unchanged (brand ring +
`bg-bg-elevated`) — the R25 selection vocabulary is preserved.

## Files

| File | Change |
|---|---|
| `src/styles/tokens.css` | `--canvas-*` family — dark `:root` + light mirror |
| `tailwind.config.js` | `canvas` colour group + `shadow-canvas-node` / `-recess` |
| `processes/ProcessesClient.tsx` | Body → elevated workspace frame |
| `processes/PersistedProcessCanvas.tsx` | chrome strips, recessed canvas plane, grid token |
| `processes/ProcessPalette.tsx` | strip + tactile stamp restyle |
| `processes/CanvasHelpStrip.tsx` | quieter chrome band |
| `processes/ProcessInspector.tsx` | frame surface, wider, padding rhythm |
| `processes/ProcessTypedNode.tsx` | solid elevated-card surfaces |
| `processes/ProcessCanvas.tsx` | grid token (legacy component parity) |
| `docs/processes-canvas.md` | Visual-contract section rewritten |

## Decisions

- **A dedicated `--canvas-*` family, not reuse of `--bg-*`.** The
  editor canvas is a genuine semantic surface (like charts got
  their own tokens). It needs a recessed plane that no `--bg-*`
  token provides. Full light/dark parity keeps the theme contract.
- **Tonal layering over hue contrast.** Every value stays navy —
  depth comes from a monotonic luminance ramp, not a new accent
  hue. Keeps the surface calm and on-brand ("restraint, not
  clutter").
- **The recessed plane has no inner box.** An infinite pan/zoom
  canvas can't host a bounded child container — the recessed
  colour + inset shadow ARE the "working plane" treatment.
- **Edges deferred to PR-B.** Prompt 1 mentions edge colour but
  prompt 4 owns the edge language; PR-A leaves `ProcessEdge`
  untouched to keep the split clean.
- **R25 dot-grid ratchet updated, not bypassed.** The ratchet
  pinned `--border-subtle`; a deliberate redesign re-points it at
  `--canvas-grid`.
