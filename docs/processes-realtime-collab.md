# Real-Time Collaboration — Process Canvas

**Status:** Design + foundation only (Epic P6-PR-C). Full multi-
user node-mutation merging deferred to a future workstream.

## Brief

The gap-analysis brief flagged real-time collaboration (gap #3
🟡) — "Two users editing the same map will overwrite each other
on save." Epic P1 (#732) closed the silent-data-loss half via
optimistic concurrency (the second saver gets a 409 + "Reload"
toast). Real-time collab is the next step: instead of *refusing*
the second save, *merge* both users' changes live.

This doc captures the architecture we'd pursue, the dependencies
we'd add, and the staged delivery plan that lets each stage ship
independently. The goal is to be ready to start when product
demand surfaces — not to ship the whole thing now.

## Why staged

Real-time collab is a 1–2 week effort with substantial new infra:

  - A new transport layer (WebSocket service, or SSE + POST
    sidecar for write fan-out).
  - A new CRDT dependency (Yjs is the canonical choice).
  - A new persistence model (server-side Yjs document storage +
    snapshot reconciliation with the existing `ProcessMap` rows).
  - A new awareness protocol (cursor positions, selection sets,
    user colour assignments).

Each of those is a substantial undertaking. Shipping them as one
PR creates a high blast-radius landing surface. Staging them lets
each piece ship on its own merits.

## Stage 1 — Presence-only (THIS PR — feature-flagged)

The smallest possible foundation that lets us observe + iterate
on the real surface: a `useCanvasPresence` hook that **today**
returns an empty roster, but **gates** the eventual WebSocket
subscription behind `NEXT_PUBLIC_ENABLE_CANVAS_PRESENCE=1`.

  - Hook lives at `src/lib/processes/use-canvas-presence.ts`.
  - Returns `{ roster: PresenceUser[], publish: (cursor)
    => void }`.
  - With the flag off (production default), `roster` is always
    `[]` and `publish` is a no-op — zero runtime cost, zero
    behavioural change.
  - With the flag on, the hook resolves a `wss://…/canvas-
    presence/<mapId>` URL. The actual WebSocket service does not
    exist yet; staging this in code lets us discover integration
    points without committing to the infra. (When the service
    lands, the hook's `IS_PRESENCE_ENABLED` constant flips by
    flag, and we add the transport implementation.)

The visual surface — coloured cursor sprites following other
users' mouse positions on the canvas — would mount via the same
xyflow viewport machinery as the proximity preview edge: a
`renderPresence` slot inside `<ReactFlow>` would project the
roster into screen-space cursors.

## Stage 2 — Yjs document + WebSocket transport

Add `yjs` + `y-websocket` as dependencies. Stand up a small
WebSocket service (or extend the existing Next route handler
runtime — `runtime = 'nodejs'` + WebSocket upgrade). The Yjs
document represents the canvas state; updates fan out to every
connected client via the awareness + sync protocols.

The persistence question is the trickiest part. Two options:

**Option A — Yjs as source of truth.** The server holds the
authoritative Yjs document; the existing `ProcessMap` /
`ProcessNode` / `ProcessEdge` rows become a denormalised
projection updated on every commit. The `replaceGraph` path
becomes a Yjs-update-handler that rebuilds the row state.

**Option B — Yjs as transient sync layer.** The Yjs document
lives only while a session is active; on every save (or on
debounce) the doc serialises back into the existing row model.
The row model remains the source of truth.

Option A is the cleaner long-term shape — it gives us
collaborative undo, conflict-free reordering, and offline-first
flows for free. Option B is the lower-risk migration path — the
existing schema + queries keep working unchanged.

Recommendation: **Option B for Stage 2** to keep the existing
analytics + reverse-lookup + snapshot machinery intact. Migrate
to Option A in a follow-up stage if product demand justifies the
schema upheaval.

## Stage 3 — Per-tenant presence colours + cursor sprites

The visual layer. Each user gets a deterministic colour assigned
from a palette of 12 (cycling on overflow). Cursor sprites render
at the user's last-known viewport-relative position; idle cursors
fade after 5 seconds.

## Stage 4 — Multi-user mutation merge

The hard part. Yjs's `Y.Map` + `Y.Array` give us conflict-free
merges for node + edge updates. The work is in mapping our
specific operations (move node, add edge, edit label) into Yjs
mutations that preserve the operation's intent under concurrent
edits.

## Non-goals

  - **Voice / video.** Out of scope for the compliance-canvas
    surface.
  - **Comment threads on nodes.** Belongs to the existing task /
    comment system, not the canvas layer.
  - **Operational transform (OT).** CRDTs (Yjs) are the canonical
    choice for graph-shaped data; OT shines for linear text but
    fights node + edge merges.

## Risks + mitigations

  - **WebSocket service infra.** Cloud Run / Fargate WebSocket
    pricing is per-connection-second. Mitigation: SSE + POST
    sidecar for the awareness layer (cheaper, no upgrade
    handshake overhead) + WebSocket only for the Yjs sync stream.
  - **Yjs bundle size.** ~150KB gzip on the client. Mitigation:
    lazy-load behind the feature flag — users without collab
    enabled pay zero bytes.
  - **Schema drift.** Option B keeps the existing rows
    authoritative; Stage 4 would need a migration plan if we
    ever pivot to Option A.

## Open questions

  - **Who pays for the WebSocket service?** The current Inflect
    pricing tiers don't account for live-collab connection
    seconds. Pricing team decision before Stage 2 ships.
  - **Awareness rate-limit?** A high-frequency cursor stream can
    overwhelm the awareness channel. Probable answer: 60Hz
    throttle on the client; debounce non-cursor awareness
    (selection set) to 250ms.
  - **Auth on the WebSocket?** Same JWT cookie path as the rest
    of the app, validated on the WebSocket upgrade request.

## When to start Stage 2

When at least ONE of the following lands as a customer signal:

  - A paying customer ≥50 users requests "edit together".
  - A sales call cites the absence of real-time as a reason to
    pick a competitor.
  - The Q3 product OKRs name collaboration as a target.

Until then, Stage 1's presence-only foundation stays
feature-flagged off in production. The doc + the hook + the
ratchet keep the architecture seam visible so the team can pick
this up without a re-discovery pass.
