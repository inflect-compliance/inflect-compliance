/**
 * Epic 47.1 — typed graph contract for the traceability explorer.
 *
 * Used by:
 *   - the API route (server-side serialization)
 *   - the `<GraphExplorer>` UI primitive (which passes the
 *     `nodes`/`edges` straight to React Flow after a tiny adapter
 *     pass)
 *   - any future surface that wants to consume the same typed graph
 *     without re-querying (a CSV exporter, an audit-pack
 *     attachment, the Org Coverage view's drill-down)
 *
 * Design choices:
 *   - **Stable typed enums** for `kind` (entity type) and edge
 *     `relation`. New entity types (Policy, Vendor, Framework, …)
 *     get added here once and become valid everywhere.
 *   - **Categories carried in the payload** so the client can
 *     legend / colour / filter without a second round-trip and
 *     without baking entity-type knowledge into the explorer.
 *   - **Filter-shape declared but optional** — the API doesn't
 *     have to honour every filter today, but the contract lets
 *     us add server-side filtering without breaking clients.
 *   - **Pagination signal in `meta`** — when the result is
 *     truncated (large tenants), clients see `truncated: true`
 *     and a count of what was dropped.
 */

// ─── Node + edge categories ────────────────────────────────────────────

/**
 * Every entity type that can currently appear as a graph node.
 * Add a new value here AND extend `TRACEABILITY_NODE_CATEGORIES`
 * with its display metadata; downstream code is type-checked.
 *
 * The first phase ships `control`, `risk`, `asset`. Future phases
 * (likely policies, framework requirements, vendors) extend this
 * union without any contract break — the explorer just paints the
 * new colour.
 */
export type TraceabilityNodeKind =
    | 'control'
    | 'risk'
    | 'asset'
    | 'requirement'
    | 'policy';

/**
 * Edge relation type. Mirrors the link-table semantics in the schema:
 *
 *   `mitigates`     — RiskControl: a control mitigates a risk.
 *   `protects`      — ControlAsset: a control protects an asset.
 *   `exposes`       — AssetRiskLink: an asset exposes risk.
 *   `implements`    — ControlRequirementLink: a control implements
 *                     a framework requirement (carried for parity
 *                     with the Epic 46 viewer; reserved for a
 *                     future explorer mode).
 *   `governs`       — PolicyControlLink: a policy governs a control
 *                     (the control operationalises the policy).
 */
export type TraceabilityEdgeRelation =
    | 'mitigates'
    | 'protects'
    | 'exposes'
    | 'implements'
    | 'governs';

// ─── Wire shapes ───────────────────────────────────────────────────────

export interface TraceabilityNode {
    /** Stable id — the underlying entity's primary key (cuid). */
    id: string;
    kind: TraceabilityNodeKind;
    /**
     * Short label rendered on the node (e.g. control code or risk
     * title). Free-form string; the renderer truncates as needed.
     */
    label: string;
    /**
     * Optional secondary text — e.g. a status badge, severity, or
     * the requirement code under a control. Null when there's
     * nothing useful to show.
     */
    secondary: string | null;
    /**
     * Status / severity / criticality colour-cue. Free-form so each
     * entity kind can pick its own enum (control status, risk score
     * band, asset criticality). The explorer renders it as a small
     * chip; the legend in `categories` documents what each value
     * means per-kind.
     */
    badge: string | null;
    /**
     * Detail-page href (relative). Lets the explorer make any node
     * clickable without extra plumbing. Null for synthesized /
     * non-navigable nodes (none today).
     */
    href: string | null;
}

export interface TraceabilityEdge {
    /** Stable edge id — usually the link-row primary key. */
    id: string;
    /** Source node id (`from`). */
    source: string;
    /** Target node id (`to`). */
    target: string;
    relation: TraceabilityEdgeRelation;
    /**
     * Free-form qualifier for the edge — e.g. coverage type
     * (FULL / PARTIAL) for control→asset, or exposure level
     * (DIRECT / INHERITED) for asset→risk. Surfaces in the edge
     * tooltip; the explorer may also use it for edge styling.
     */
    qualifier: string | null;
}

/**
 * Display metadata for one node category. The API ships one entry
 * per `TraceabilityNodeKind` it actually returned; the explorer's
 * legend renders from this list.
 */
export interface TraceabilityCategory {
    kind: TraceabilityNodeKind;
    /** Human label ("Control", "Risk", "Asset"…). */
    label: string;
    /** Plural label for legend rows ("Controls"). */
    pluralLabel: string;
    /**
     * Inline color token (semantic class slug — explorer maps to
     * CSS). The palette mirrors WCAG-safe hue spacing so a
     * deuteranope can still distinguish neighbouring kinds; pair
     * with `iconKey` + `pattern` below for non-color cues.
     */
    color: 'sky' | 'rose' | 'emerald' | 'violet' | 'amber' | 'slate';
    /**
     * Lucide icon name rendered on the node + in the legend. The
     * icon is a non-color cue — colour-blind users still see a
     * different glyph per kind. The mapping lives in the
     * GraphExplorer; this field is just a stable key.
     */
    iconKey: 'shield-check' | 'alert-triangle' | 'box' | 'file-text' | 'scroll-text';
    /**
     * Border pattern variant — second non-color cue. Different
     * line styles let `prefers-reduced-color` users still
     * distinguish kinds at a glance even with the colour palette
     * collapsed.
     */
    pattern: 'solid' | 'dashed' | 'double';
    /** Count of nodes of this kind in the current payload. */
    count: number;
}

// ─── Top-level payload ─────────────────────────────────────────────────

export interface TraceabilityGraphMeta {
    /** True iff the result was truncated by a server-side cap. */
    truncated: boolean;
    /** When `truncated`, how many additional rows were dropped. */
    droppedNodeCount: number;
    /** Soft cap that produced the truncation (when applicable). */
    nodeCap: number | null;
    /** Filters the API actually applied (echoed back for clients). */
    appliedFilters: TraceabilityGraphFilters;
}

export interface TraceabilityGraphFilters {
    /** Restrict to a subset of entity kinds. Empty = all. */
    kinds?: TraceabilityNodeKind[];
    /**
     * Restrict to nodes reachable within `n` hops of a focus node id.
     * Reserved for a phase-2 "focus + expand" explorer mode; the
     * MVP route ignores it gracefully.
     */
    focusId?: string;
    focusRadius?: number;
}

export interface TraceabilityGraph {
    nodes: TraceabilityNode[];
    edges: TraceabilityEdge[];
    categories: TraceabilityCategory[];
    meta: TraceabilityGraphMeta;
}

// ─── Display metadata table ────────────────────────────────────────────

/**
 * Source-of-truth for human labels + chosen palette per kind.
 * Lives next to the contract so adding a new `TraceabilityNodeKind`
 * is a one-place change.
 */
export const TRACEABILITY_CATEGORY_DEFAULTS: Record<
    TraceabilityNodeKind,
    Omit<TraceabilityCategory, 'count' | 'kind'>
> = {
    control: {
        label: 'Control',
        pluralLabel: 'Controls',
        color: 'sky',
        iconKey: 'shield-check',
        pattern: 'solid',
    },
    risk: {
        label: 'Risk',
        pluralLabel: 'Risks',
        color: 'rose',
        iconKey: 'alert-triangle',
        pattern: 'solid',
    },
    asset: {
        label: 'Asset',
        pluralLabel: 'Assets',
        color: 'amber',
        iconKey: 'box',
        pattern: 'dashed',
    },
    requirement: {
        label: 'Requirement',
        pluralLabel: 'Requirements',
        color: 'emerald',
        iconKey: 'file-text',
        pattern: 'solid',
    },
    policy: {
        label: 'Policy',
        pluralLabel: 'Policies',
        color: 'violet',
        iconKey: 'scroll-text',
        pattern: 'double',
    },
};

// ─── Default cap ───────────────────────────────────────────────────────

/**
 * Default soft cap on total nodes returned. React Flow performance
 * with the default renderer becomes degraded above ~500 nodes;
 * past this we apply per-kind sampling and flag `truncated: true`.
 * Server-side filters (kind whitelist, focus radius) bring the
 * number back down without tweaking this constant.
 */
export const DEFAULT_NODE_CAP = 500;
