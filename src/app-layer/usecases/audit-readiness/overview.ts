/**
 * Audit Readiness — Overview orchestrator.
 *
 * Single-call data contract for the readiness overview page. Replaces
 * the previous 1+N waterfall (`GET /audits/cycles` followed by N
 * parallel `GET /audits/cycles/:id/readiness` per cycle) with one
 * server-side aggregation.
 *
 * Why this exists:
 *
 *   • The overview page renders a card per audit cycle with the
 *     cycle's readiness score. The previous client-side flow:
 *       1. Fetch the cycle list.
 *       2. For each cycle, in parallel, fetch its readiness score.
 *     With N cycles, that's 1 + N HTTP round-trips. Each round-trip
 *     pays the WAN latency at least once. On a 100ms-RTT connection
 *     with 5 cycles, that's ~600ms blocked on network alone, even
 *     though the per-cycle DB queries themselves are fast.
 *
 *   • This orchestrator runs the same fan-out *server-side*, where
 *     the per-cycle work is bound by LAN-fast DB latency rather than
 *     WAN-fast HTTP latency. Total wall-clock time collapses to one
 *     RTT plus the slowest DB query.
 *
 * Failure-mode contract:
 *
 *   • If a single cycle's `scoreReadiness` throws, the orchestrator
 *     swallows the error for that cycle and emits no entry in
 *     `scoresByCycleId`. The page renders the cycle's card without
 *     a score (matching the previous client-side behaviour where
 *     each per-cycle fetch had its own try/catch). One bad cycle
 *     never takes the whole overview down.
 */
import { RequestContext } from '../../types';
import { listAuditCycles } from './cycles';
import { scoreReadiness, type ReadinessResult } from '../audit-readiness-scoring';

export interface ReadinessOverviewPayload {
    cycles: Awaited<ReturnType<typeof listAuditCycles>>;
    /**
     * Readiness scores keyed by cycle id. A cycle id is ABSENT from
     * this map when its score computation failed — the page should
     * render the cycle without a score rather than show a stale or
     * empty number.
     */
    scoresByCycleId: Record<string, ReadinessResult>;
}

export async function getReadinessOverview(
    ctx: RequestContext,
): Promise<ReadinessOverviewPayload> {
    const cycles = await listAuditCycles(ctx);

    // Fan out per-cycle readiness in parallel; tolerate per-cycle
    // failures so a single broken framework doesn't blank the page.
    // COMPUTE-ONLY (`scoreReadiness`) — the overview is a read surface
    // visited on every list navigation, so it must NOT persist a
    // snapshot per cycle (that write-amplification polluted the
    // readiness trend). Snapshots are recorded only on the deliberate
    // single-cycle scoring path.
    const settled = await Promise.allSettled(
        cycles.map((c) => scoreReadiness(ctx, c.id)),
    );

    const scoresByCycleId: Record<string, ReadinessResult> = {};
    for (let i = 0; i < cycles.length; i++) {
        const r = settled[i];
        if (r.status === 'fulfilled') {
            scoresByCycleId[cycles[i].id] = r.value;
        }
    }

    return { cycles, scoresByCycleId };
}
