/**
 * RQ-7 — bow-tie projection (pure). No DB.
 */
import { buildBowTie, toXyFlowGraph, type BowTieRisk, type BowTieControl } from '@/app-layer/usecases/bowtie-projection';

const risk = (over: Partial<BowTieRisk> = {}): BowTieRisk => ({
    id: 'r1', title: 'SQL Injection', category: 'Technical', score: 16,
    fairAle: 600_000, sleAmount: null, aroAmount: null,
    threat: 'External attacker; Insider threat', vulnerability: 'Unvalidated input',
    threatEventFrequency: 10, vulnerabilityProbability: 0.6,
    primaryLossMagnitude: null, productivityLoss: 150_000, responseCost: 80_000, replacementCost: null, secondaryLossMagnitude: 40_000,
    ...over,
});
const ctl = (id: string, mitigationType: string): BowTieControl => ({ controlId: id, title: `Control ${id}`, status: 'IMPLEMENTED', effectiveness: 80, mitigationType });

describe('buildBowTie', () => {
    it('places preventive controls left, detective/corrective right', () => {
        const p = buildBowTie(risk(), [ctl('waf', 'PREVENTIVE'), ctl('input', 'PREVENTIVE'), ctl('ir', 'CORRECTIVE'), ctl('mon', 'DETECTIVE')]);
        expect(p.preventiveBarriers.map((b) => b.controlId)).toEqual(['waf', 'input']);
        expect(p.mitigatingBarriers.map((b) => b.controlId).sort()).toEqual(['ir', 'mon']);
    });

    it('splits the threat narrative into discrete threat sources', () => {
        const p = buildBowTie(risk(), []);
        expect(p.threats.map((t) => t.label)).toEqual(['External attacker', 'Insider threat']);
        expect(p.threats[0].tef).toBe(10);
    });

    it('no controls → empty barrier arrays, threats + consequences still present', () => {
        const p = buildBowTie(risk(), []);
        expect(p.preventiveBarriers).toHaveLength(0);
        expect(p.mitigatingBarriers).toHaveLength(0);
        expect(p.threats.length).toBeGreaterThan(0);
        expect(p.consequences.length).toBeGreaterThan(0);
    });

    it('decomposes FAIR PLM into separate consequence nodes', () => {
        const p = buildBowTie(risk(), []);
        const labels = p.consequences.map((c) => c.label);
        expect(labels).toContain('Productivity loss');
        expect(labels).toContain('Response cost');
        expect(labels).toContain('Secondary loss');
        expect(p.consequences.find((c) => c.label === 'Secondary loss')!.type).toBe('SECONDARY');
    });

    it('falls back to a single loss node when no FAIR decomposition', () => {
        const p = buildBowTie(risk({ productivityLoss: null, responseCost: null, replacementCost: null, secondaryLossMagnitude: null, primaryLossMagnitude: null }), []);
        expect(p.consequences).toHaveLength(1);
        expect(p.consequences[0].magnitude).toBe(600_000); // resolveALE(fairAle)
    });
});

describe('toXyFlowGraph', () => {
    it('produces nodes + edges with no orphan edges', () => {
        const p = buildBowTie(risk(), [ctl('waf', 'PREVENTIVE'), ctl('ir', 'CORRECTIVE')]);
        const { nodes, edges } = toXyFlowGraph(p);
        const ids = new Set(nodes.map((n) => n.id));
        expect(nodes.some((n) => n.type === 'bowTieEvent')).toBe(true);
        for (const e of edges) {
            expect(ids.has(e.source)).toBe(true);
            expect(ids.has(e.target)).toBe(true);
        }
        // event has both threat-side and consequence-side connections
        const eventId = nodes.find((n) => n.type === 'bowTieEvent')!.id;
        expect(edges.some((e) => e.target === eventId)).toBe(true);
        expect(edges.some((e) => e.source === eventId)).toBe(true);
    });
});
