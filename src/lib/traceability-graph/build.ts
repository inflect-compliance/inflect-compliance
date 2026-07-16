/**
 * Epic 47.1 — pure helpers for assembling the traceability graph
 * from raw entity + link rows.
 *
 * Pulled out of the usecase so the assembly logic is unit-testable
 * without Prisma. The usecase is just: query → normalise → call
 * `buildTraceabilityGraph` → return.
 */

import {
    DEFAULT_NODE_CAP,
    TRACEABILITY_CATEGORY_DEFAULTS,
    type TraceabilityCategory,
    type TraceabilityEdge,
    type TraceabilityGraph,
    type TraceabilityGraphFilters,
    type TraceabilityNode,
    type TraceabilityNodeKind,
} from './types';

// ─── Inputs ────────────────────────────────────────────────────────────

export interface RawControl {
    id: string;
    code: string | null;
    name: string;
    status: string;
}

export interface RawRisk {
    id: string;
    title: string;
    score: number;
    status: string;
    category: string | null;
}

export interface RawAsset {
    id: string;
    name: string;
    type: string;
    criticality: string | null;
    status: string;
}

export interface RawRequirement {
    id: string;
    code: string;
    title: string;
    framework: { name: string } | null;
}

export interface RawLink {
    /** Underlying link-row id. */
    id: string;
    /** Endpoint A — must match a node id in the input set. */
    a: string;
    /** Endpoint B — must match a node id in the input set. */
    b: string;
    relation: TraceabilityEdge['relation'];
    qualifier: string | null;
}

export interface BuildInput {
    tenantSlug: string;
    controls: ReadonlyArray<RawControl>;
    risks: ReadonlyArray<RawRisk>;
    assets: ReadonlyArray<RawAsset>;
    requirements: ReadonlyArray<RawRequirement>;
    /** Edges, all four relationship types pre-tagged. */
    links: ReadonlyArray<RawLink>;
    /** Filters the caller asked for — echoed back in `meta`. */
    filters?: TraceabilityGraphFilters;
    nodeCap?: number;
}

// ─── Normalisation ─────────────────────────────────────────────────────

function controlNode(c: RawControl, tenantSlug: string): TraceabilityNode {
    const codeOrName = c.code || c.name;
    return {
        id: c.id,
        kind: 'control',
        label: codeOrName,
        secondary: c.code ? c.name : null,
        badge: c.status,
        href: `/t/${tenantSlug}/controls/${c.id}`,
    };
}

function riskNode(r: RawRisk, tenantSlug: string): TraceabilityNode {
    return {
        id: r.id,
        kind: 'risk',
        label: r.title,
        secondary: r.category,
        badge: r.status,
        href: `/t/${tenantSlug}/risks/${r.id}`,
    };
}

function assetNode(a: RawAsset, tenantSlug: string): TraceabilityNode {
    return {
        id: a.id,
        kind: 'asset',
        label: a.name,
        secondary: a.type.replace(/_/g, ' '),
        badge: a.criticality,
        href: `/t/${tenantSlug}/assets/${a.id}`,
    };
}

function requirementNode(r: RawRequirement): TraceabilityNode {
    return {
        id: r.id,
        kind: 'requirement',
        // Requirement code leads (e.g. "A.5.1"); the full title is the
        // secondary line, mirroring controlNode's code/name split.
        label: r.code ? `${r.code} ${r.title}` : r.title,
        secondary: r.framework?.name ?? null,
        badge: null,
        // Requirements have no per-id detail route (they live inside the
        // framework page keyed by framework key, which we don't select
        // here) — non-navigable, so null per the TraceabilityNode contract.
        href: null,
    };
}

// ─── Capping ───────────────────────────────────────────────────────────

/**
 * When the total node count exceeds the cap, sample
 * proportionally per kind so each category's relative weight is
 * preserved. The simplest stable strategy: keep `cap * (kindCount /
 * total)` rows of each kind, prioritising recently-modified rows
 * via the input order (Prisma default order is creation order; the
 * caller passes the prepared list).
 */
function capNodes(
    nodes: TraceabilityNode[],
    cap: number,
): { kept: TraceabilityNode[]; dropped: number } {
    if (nodes.length <= cap) return { kept: [...nodes], dropped: 0 };
    const byKind = new Map<TraceabilityNodeKind, TraceabilityNode[]>();
    for (const n of nodes) {
        const list = byKind.get(n.kind) ?? [];
        list.push(n);
        byKind.set(n.kind, list);
    }
    const kept: TraceabilityNode[] = [];
    for (const [kind, list] of byKind) {
        const share = Math.max(1, Math.round((cap * list.length) / nodes.length));
        // First-N — the input order is the caller's preferred order.
        kept.push(...list.slice(0, share));
        void kind; // keep eslint happy if later code wants to log per-kind
    }
    return { kept, dropped: nodes.length - kept.length };
}

// ─── Builder ───────────────────────────────────────────────────────────

export function buildTraceabilityGraph(input: BuildInput): TraceabilityGraph {
    const cap = input.nodeCap ?? DEFAULT_NODE_CAP;
    const filters = input.filters ?? {};
    const allowedKinds = filters.kinds && filters.kinds.length > 0
        ? new Set(filters.kinds)
        : null;

    // 1. Normalise + filter by kind.
    const allNodes: TraceabilityNode[] = [];
    if (!allowedKinds || allowedKinds.has('control')) {
        for (const c of input.controls) allNodes.push(controlNode(c, input.tenantSlug));
    }
    if (!allowedKinds || allowedKinds.has('risk')) {
        for (const r of input.risks) allNodes.push(riskNode(r, input.tenantSlug));
    }
    if (!allowedKinds || allowedKinds.has('asset')) {
        for (const a of input.assets) allNodes.push(assetNode(a, input.tenantSlug));
    }
    if (!allowedKinds || allowedKinds.has('requirement')) {
        for (const r of input.requirements) allNodes.push(requirementNode(r));
    }

    // 2. Apply soft cap (keeps relative weights per kind).
    const { kept, dropped } = capNodes(allNodes, cap);
    const keptIds = new Set(kept.map((n) => n.id));

    // 3. Filter edges to those whose BOTH endpoints survived.
    const edges: TraceabilityEdge[] = [];
    for (const link of input.links) {
        if (!keptIds.has(link.a) || !keptIds.has(link.b)) continue;
        edges.push({
            id: link.id,
            source: link.a,
            target: link.b,
            relation: link.relation,
            qualifier: link.qualifier,
        });
    }

    // 4. Categories — counts based on the FINAL node list (not raw input).
    const categories: TraceabilityCategory[] = [];
    const counts: Record<TraceabilityNodeKind, number> = {
        control: 0,
        risk: 0,
        asset: 0,
        requirement: 0,
        policy: 0,
    };
    for (const n of kept) counts[n.kind] += 1;
    for (const kind of Object.keys(counts) as TraceabilityNodeKind[]) {
        if (counts[kind] === 0) continue;
        categories.push({
            kind,
            count: counts[kind],
            ...TRACEABILITY_CATEGORY_DEFAULTS[kind],
        });
    }

    return {
        nodes: kept,
        edges,
        categories,
        meta: {
            truncated: dropped > 0,
            droppedNodeCount: dropped,
            nodeCap: dropped > 0 ? cap : null,
            appliedFilters: {
                ...(filters.kinds ? { kinds: filters.kinds } : {}),
                ...(filters.focusId ? { focusId: filters.focusId } : {}),
                ...(filters.focusRadius !== undefined
                    ? { focusRadius: filters.focusRadius }
                    : {}),
            },
        },
    };
}
