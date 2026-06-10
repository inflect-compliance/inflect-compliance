/**
 * RQ-7 — bow-tie analysis projection.
 *
 * A bow-tie (ISO 31010) is the threat → risk-event → consequence chain with
 * control barriers on each side. It is NOT stored — it is computed at read
 * time from existing data: Risk narrative + FAIR factors (RQ-1), RiskControl
 * links, and Control.mitigationType (PREVENTIVE barriers left, DETECTIVE/
 * CORRECTIVE barriers right).
 *
 * `buildBowTie` + `toXyFlowGraph` are pure — unit-testable.
 *
 * @module usecases/bowtie-projection
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { assertCanRead } from '../policies/common';
import { resolveALE } from './fair-calculator';

export interface BowTieBarrier { controlId: string; title: string; status: string; effectiveness: number | null }
export interface BowTieProjection {
    event: { riskId: string; title: string; category: string | null; score: number; ale: number | null };
    threats: Array<{ id: string; label: string; tef: number | null; vulnerability: number | null }>;
    preventiveBarriers: BowTieBarrier[];
    consequences: Array<{ id: string; label: string; magnitude: number | null; type: 'PRIMARY' | 'SECONDARY' }>;
    mitigatingBarriers: BowTieBarrier[];
}

/** A risk reduced to the fields the bow-tie reads. */
export interface BowTieRisk {
    id: string; title: string; category: string | null; score: number;
    fairAle: number | null; sleAmount: number | null; aroAmount: number | null;
    threat: string | null; vulnerability: string | null;
    threatEventFrequency: number | null; vulnerabilityProbability: number | null;
    primaryLossMagnitude: number | null; productivityLoss: number | null; responseCost: number | null;
    replacementCost: number | null; secondaryLossMagnitude: number | null;
}
export interface BowTieControl { controlId: string; title: string; status: string; effectiveness: number | null; mitigationType: string | null }

/** Split a free-text threat narrative into discrete threat-source labels. */
function splitThreats(narrative: string | null): string[] {
    if (!narrative) return [];
    return narrative.split(/[\n;,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
}

/** Pure bow-tie projection from a loaded risk + its control links. */
export function buildBowTie(risk: BowTieRisk, controls: BowTieControl[]): BowTieProjection {
    const ale = resolveALE({ fairAle: risk.fairAle, sleAmount: risk.sleAmount, aroAmount: risk.aroAmount });

    const threatLabels = splitThreats(risk.threat);
    const threats = (threatLabels.length ? threatLabels : ['Threat source']).map((label, i) => ({
        id: `threat-${i}`, label,
        tef: risk.threatEventFrequency, vulnerability: risk.vulnerabilityProbability,
    }));

    const barrier = (c: BowTieControl): BowTieBarrier => ({ controlId: c.controlId, title: c.title, status: c.status, effectiveness: c.effectiveness });
    const preventiveBarriers = controls.filter((c) => c.mitigationType === 'PREVENTIVE' || c.mitigationType === 'DETERRENT').map(barrier);
    const mitigatingBarriers = controls.filter((c) => c.mitigationType === 'DETECTIVE' || c.mitigationType === 'CORRECTIVE' || c.mitigationType === 'COMPENSATING').map(barrier);

    // Consequences from the FAIR PLM decomposition; fall back to a single ALE node.
    const consequences: BowTieProjection['consequences'] = [];
    const add = (label: string, magnitude: number | null, type: 'PRIMARY' | 'SECONDARY') => {
        if (magnitude != null && magnitude > 0) consequences.push({ id: `cons-${consequences.length}`, label, magnitude, type });
    };
    add('Productivity loss', risk.productivityLoss, 'PRIMARY');
    add('Response cost', risk.responseCost, 'PRIMARY');
    add('Replacement cost', risk.replacementCost, 'PRIMARY');
    add('Secondary loss', risk.secondaryLossMagnitude, 'SECONDARY');
    if (consequences.length === 0) {
        add('Primary loss', risk.primaryLossMagnitude ?? ale, 'PRIMARY');
    }
    if (consequences.length === 0) consequences.push({ id: 'cons-0', label: 'Loss event', magnitude: ale, type: 'PRIMARY' });

    return {
        event: { riskId: risk.id, title: risk.title, category: risk.category, score: risk.score, ale },
        threats, preventiveBarriers, consequences, mitigatingBarriers,
    };
}

export interface XyFlowNode { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }
export interface XyFlowEdge { id: string; source: string; target: string; label?: string }

/** Convert a projection to xyflow nodes + edges (threats left → event → consequences right). */
export function toXyFlowGraph(p: BowTieProjection): { nodes: XyFlowNode[]; edges: XyFlowEdge[] } {
    const nodes: XyFlowNode[] = [];
    const edges: XyFlowEdge[] = [];
    const COL = { threat: 0, prevBarrier: 260, event: 520, mitBarrier: 780, consequence: 1040 };
    const row = (i: number, n: number) => (i - (n - 1) / 2) * 120;

    const eventId = `event-${p.event.riskId}`;
    nodes.push({ id: eventId, type: 'bowTieEvent', position: { x: COL.event, y: 0 }, data: { ...p.event } });

    p.threats.forEach((t, i) => {
        nodes.push({ id: t.id, type: 'bowTieThreat', position: { x: COL.threat, y: row(i, p.threats.length) }, data: { ...t } });
    });
    p.preventiveBarriers.forEach((b, i) => {
        const id = `prev-${b.controlId}`;
        nodes.push({ id, type: 'bowTiePreventiveBarrier', position: { x: COL.prevBarrier, y: row(i, p.preventiveBarriers.length) }, data: { ...b } });
        edges.push({ id: `e-${id}`, source: id, target: eventId });
    });
    // Threats feed the event (through the preventive side).
    p.threats.forEach((t) => edges.push({ id: `e-${t.id}`, source: t.id, target: eventId }));

    p.consequences.forEach((c, i) => {
        nodes.push({ id: c.id, type: 'bowTieConsequence', position: { x: COL.consequence, y: row(i, p.consequences.length) }, data: { ...c } });
        edges.push({ id: `e-${c.id}`, source: eventId, target: c.id });
    });
    p.mitigatingBarriers.forEach((b, i) => {
        const id = `mit-${b.controlId}`;
        nodes.push({ id, type: 'bowTieMitigatingBarrier', position: { x: COL.mitBarrier, y: row(i, p.mitigatingBarriers.length) }, data: { ...b } });
        edges.push({ id: `e-${id}`, source: eventId, target: id });
    });

    return { nodes, edges };
}

/** DB-backed projection for a single risk. */
export async function projectBowTie(ctx: RequestContext, riskId: string): Promise<BowTieProjection> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const risk = await db.risk.findFirst({
            where: { id: riskId, tenantId: ctx.tenantId, deletedAt: null },
            select: {
                id: true, title: true, category: true, score: true, fairAle: true, sleAmount: true, aroAmount: true,
                threat: true, vulnerability: true, threatEventFrequency: true, vulnerabilityProbability: true,
                primaryLossMagnitude: true, productivityLoss: true, responseCost: true, replacementCost: true, secondaryLossMagnitude: true,
            },
        });
        if (!risk) throw notFound('Risk not found');
        const links = await db.riskControl.findMany({
            where: { tenantId: ctx.tenantId, riskId },
            select: { control: { select: { id: true, name: true, status: true, effectiveness: true, mitigationType: true } } },
            take: 500,
        });
        const controls: BowTieControl[] = links
            .filter((l) => l.control)
            .map((l) => ({ controlId: l.control!.id, title: l.control!.name, status: String(l.control!.status), effectiveness: l.control!.effectiveness, mitigationType: l.control!.mitigationType ?? null }));
        return buildBowTie(risk, controls);
    });
}
