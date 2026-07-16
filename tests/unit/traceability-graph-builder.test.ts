/**
 * Epic 47.1 — pure tests for `buildTraceabilityGraph`.
 *
 * Covers normalisation (node shape per kind), category counting,
 * the soft node cap (per-kind proportional sampling), edge
 * filtering after a node is dropped, and filter passthrough into
 * `meta.appliedFilters`.
 */

import {
    buildTraceabilityGraph,
    type RawAsset,
    type RawControl,
    type RawLink,
    type RawRequirement,
    type RawRisk,
} from '@/lib/traceability-graph/build';
import { DEFAULT_NODE_CAP } from '@/lib/traceability-graph/types';

const TENANT_SLUG = 'acme-corp';

function ctrl(id: string, code = `C-${id}`, name = `Control ${id}`): RawControl {
    return { id, code, name, status: 'IMPLEMENTED' };
}
function risk(id: string, title = `Risk ${id}`): RawRisk {
    return { id, title, score: 12, status: 'OPEN', category: 'tech' };
}
function asset(id: string, name = `Asset ${id}`): RawAsset {
    return { id, name, type: 'SYSTEM', criticality: 'HIGH', status: 'ACTIVE' };
}
function requirement(
    id: string,
    code = `A.${id}`,
    title = `Requirement ${id}`,
    frameworkName: string | null = 'ISO 27001',
): RawRequirement {
    return { id, code, title, framework: frameworkName ? { name: frameworkName } : null };
}
function link(
    id: string,
    a: string,
    b: string,
    relation: RawLink['relation'],
    qualifier: string | null = null,
): RawLink {
    return { id, a, b, relation, qualifier };
}

// ─── Normalisation ─────────────────────────────────────────────────────

describe('buildTraceabilityGraph — node normalisation', () => {
    it('renders control nodes with code as label and name as secondary', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1', 'A.5.1', 'Information security policies')],
            risks: [],
            assets: [],
            requirements: [],
            links: [],
        });
        expect(g.nodes).toHaveLength(1);
        expect(g.nodes[0]).toMatchObject({
            id: 'c1',
            kind: 'control',
            label: 'A.5.1',
            secondary: 'Information security policies',
            badge: 'IMPLEMENTED',
            href: '/t/acme-corp/controls/c1',
        });
    });

    it('uses control name as label when code is missing', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [{ id: 'c1', code: null, name: 'Access Logging', status: 'IN_PROGRESS' }],
            risks: [],
            assets: [],
            requirements: [],
            links: [],
        });
        expect(g.nodes[0].label).toBe('Access Logging');
        expect(g.nodes[0].secondary).toBeNull();
    });

    it('renders risk nodes with title as label, category as secondary', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [],
            risks: [risk('r1', 'Phishing exposure')],
            assets: [],
            requirements: [],
            links: [],
        });
        expect(g.nodes[0]).toMatchObject({
            id: 'r1',
            kind: 'risk',
            label: 'Phishing exposure',
            secondary: 'tech',
            badge: 'OPEN',
            href: '/t/acme-corp/risks/r1',
        });
    });

    it('renders asset nodes with name + humanised type', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [],
            risks: [],
            assets: [{ id: 'a1', name: 'Prod DB', type: 'DATA_STORE', criticality: 'HIGH', status: 'ACTIVE' }],
            requirements: [],
            links: [],
        });
        expect(g.nodes[0]).toMatchObject({
            id: 'a1',
            kind: 'asset',
            label: 'Prod DB',
            secondary: 'DATA STORE',
            badge: 'HIGH',
            href: '/t/acme-corp/assets/a1',
        });
    });

    it('renders requirement nodes with code+title label and framework as secondary', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [],
            risks: [],
            assets: [],
            requirements: [requirement('q1', 'A.5.1', 'Information security policies')],
            links: [],
        });
        expect(g.nodes).toHaveLength(1);
        expect(g.nodes[0]).toMatchObject({
            id: 'q1',
            kind: 'requirement',
            label: 'A.5.1 Information security policies',
            secondary: 'ISO 27001',
            badge: null,
            href: null,
        });
    });
});

// ─── Edges ─────────────────────────────────────────────────────────────

describe('buildTraceabilityGraph — edges', () => {
    it('includes edges whose endpoints both survive', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [risk('r1')],
            assets: [],
            requirements: [],
            links: [link('l1', 'c1', 'r1', 'mitigates')],
        });
        expect(g.edges).toHaveLength(1);
        expect(g.edges[0]).toMatchObject({
            id: 'l1',
            source: 'c1',
            target: 'r1',
            relation: 'mitigates',
            qualifier: null,
        });
    });

    it('emits the control→requirement implements edge between both nodes', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [],
            assets: [],
            requirements: [requirement('q1')],
            links: [link('crl:1', 'c1', 'q1', 'implements')],
        });
        expect(g.nodes.map((n) => n.kind).sort()).toEqual(['control', 'requirement']);
        expect(g.edges).toHaveLength(1);
        expect(g.edges[0]).toMatchObject({
            id: 'crl:1',
            source: 'c1',
            target: 'q1',
            relation: 'implements',
        });
        const byKind = Object.fromEntries(g.categories.map((c) => [c.kind, c.count]));
        expect(byKind.requirement).toBe(1);
    });

    it('preserves the qualifier (coverage type, exposure level)', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [],
            assets: [asset('a1')],
            requirements: [],
            links: [link('l1', 'c1', 'a1', 'protects', 'FULL')],
        });
        expect(g.edges[0].qualifier).toBe('FULL');
    });

    it('drops edges whose endpoint was dropped by a kind filter', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [risk('r1')],
            assets: [],
            requirements: [],
            links: [link('l1', 'c1', 'r1', 'mitigates')],
            filters: { kinds: ['control'] },
        });
        // Only the control node survived; the edge to the dropped
        // risk goes with it.
        expect(g.nodes.map((n) => n.id)).toEqual(['c1']);
        expect(g.edges).toHaveLength(0);
    });
});

// ─── Categories ────────────────────────────────────────────────────────

describe('buildTraceabilityGraph — categories', () => {
    it('omits categories with zero count after filtering', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [risk('r1')],
            assets: [],
            requirements: [],
            links: [],
            filters: { kinds: ['control'] },
        });
        expect(g.categories.map((c) => c.kind)).toEqual(['control']);
        expect(g.categories[0].count).toBe(1);
    });

    it('reports human labels and a stable color per kind', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [risk('r1')],
            assets: [asset('a1')],
            requirements: [],
            links: [],
        });
        const byKind = Object.fromEntries(g.categories.map((c) => [c.kind, c]));
        expect(byKind.control.label).toBe('Control');
        // Epic 47.2 palette: control=sky (blue), risk=rose (red),
        // asset=amber (distinct from blue). The earlier `brand` /
        // `sky` mapping was prompt-1 placeholder.
        expect(byKind.control.color).toBe('sky');
        expect(byKind.risk.color).toBe('rose');
        expect(byKind.asset.color).toBe('amber');
        // Per-kind icon + pattern come along for accessibility.
        expect(byKind.control.iconKey).toBe('shield-check');
        expect(byKind.risk.iconKey).toBe('alert-triangle');
        expect(byKind.asset.pattern).toBe('dashed');
    });
});

// ─── Capping ───────────────────────────────────────────────────────────

describe('buildTraceabilityGraph — capping', () => {
    it('does not truncate when total < cap', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1'), ctrl('c2')],
            risks: [risk('r1')],
            assets: [asset('a1')],
            requirements: [],
            links: [],
            nodeCap: 100,
        });
        expect(g.nodes).toHaveLength(4);
        expect(g.meta.truncated).toBe(false);
        expect(g.meta.droppedNodeCount).toBe(0);
        expect(g.meta.nodeCap).toBeNull();
    });

    it('truncates proportionally per kind when total > cap', () => {
        // 8 controls + 4 risks + 2 assets = 14; cap at 7 → keep ~4
        // controls + ~2 risks + ~1 asset (proportional shares).
        const controls = Array.from({ length: 8 }, (_, i) => ctrl(`c${i}`));
        const risks = Array.from({ length: 4 }, (_, i) => risk(`r${i}`));
        const assets = Array.from({ length: 2 }, (_, i) => asset(`a${i}`));
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls,
            risks,
            assets,
            requirements: [],
            links: [],
            nodeCap: 7,
        });
        expect(g.meta.truncated).toBe(true);
        expect(g.meta.droppedNodeCount).toBeGreaterThan(0);
        expect(g.meta.nodeCap).toBe(7);
        // Each kind still represented.
        const byKind = Object.fromEntries(g.categories.map((c) => [c.kind, c.count]));
        expect(byKind.control).toBeGreaterThan(0);
        expect(byKind.risk).toBeGreaterThan(0);
        expect(byKind.asset).toBeGreaterThan(0);
    });

    it('uses DEFAULT_NODE_CAP when caller does not override', () => {
        // We just verify the constant is wired; don't generate
        // 500+ rows here.
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [],
            assets: [],
            requirements: [],
            links: [],
        });
        expect(g.meta.truncated).toBe(false); // 1 < 500
        expect(DEFAULT_NODE_CAP).toBe(500);
    });
});

// ─── Filters echo ──────────────────────────────────────────────────────

describe('buildTraceabilityGraph — meta.appliedFilters', () => {
    it('echoes the filters the caller asked for', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [ctrl('c1')],
            risks: [],
            assets: [],
            requirements: [],
            links: [],
            filters: { kinds: ['control'], focusId: 'c1', focusRadius: 2 },
        });
        expect(g.meta.appliedFilters).toEqual({
            kinds: ['control'],
            focusId: 'c1',
            focusRadius: 2,
        });
    });

    it('returns an empty filter object when no filters are passed', () => {
        const g = buildTraceabilityGraph({
            tenantSlug: TENANT_SLUG,
            controls: [],
            risks: [],
            assets: [],
            requirements: [],
            links: [],
        });
        expect(g.meta.appliedFilters).toEqual({});
    });
});
