/**
 * Epic 47.1 — `getTraceabilityGraph` usecase.
 *
 * Pulls every Control / Risk / Asset for the calling tenant plus
 * the four relationship link tables (`RiskControl`,
 * `ControlAsset`, `AssetRiskLink`, `ControlRequirementLink`) and
 * the linked FrameworkRequirements, then assembles them into a
 * typed, capped, category-tagged graph payload via
 * `buildTraceabilityGraph`.
 *
 * Authz — any authenticated tenant member (read-only). Mirrors the
 * existing `getControlTraceability` etc. usecases — those are also
 * unconditionally readable per `assertCanRead` in
 * `traceability.ts`.
 *
 * Tenant scoping: every read happens inside `runInTenantContext`
 * so the `app.tenant_id` setting is bound + the role drops to
 * `app_user`. RLS makes cross-tenant reads architecturally
 * impossible at the DB layer; the explicit `tenantId` filter is
 * defence-in-depth.
 */

import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { forbidden } from '@/lib/errors/types';
import {
    buildTraceabilityGraph,
    type RawAsset,
    type RawControl,
    type RawLink,
    type RawRequirement,
    type RawPolicy,
    type RawRisk,
} from '@/lib/traceability-graph/build';
import {
    DEFAULT_NODE_CAP,
    type TraceabilityGraph,
    type TraceabilityGraphFilters,
    type TraceabilityNodeKind,
} from '@/lib/traceability-graph/types';

/**
 * Audit Coherence S9 (2026-05-24) — link tables fan out faster
 * than node tables (one node can sit on many edges). This
 * multiplier scales the per-link-table take relative to nodeCap;
 * 4× is the conservative headroom that mirrors what `capNodes`
 * saw pre-S9 for realistic tenants.
 */
const LINK_CAP_MULTIPLIER = 4;

export interface GetTraceabilityGraphOptions {
    filters?: TraceabilityGraphFilters;
    /** Override the soft node cap. Useful in tests. */
    nodeCap?: number;
}

export async function getTraceabilityGraph(
    ctx: RequestContext,
    options: GetTraceabilityGraphOptions = {},
): Promise<TraceabilityGraph> {
    if (!ctx.role) {
        throw forbidden('Authentication required');
    }

    const filters = options.filters ?? {};
    const wantKinds = filters.kinds && filters.kinds.length > 0
        ? new Set<TraceabilityNodeKind>(filters.kinds)
        : null;

    // Audit Coherence S9 (2026-05-24) — push pagination into the
    // DB. The pre-S9 path fetched EVERY control/risk/asset and link
    // row for the tenant, then `capNodes` clipped to the soft
    // 500-node cap in memory. A tenant with 10k controls + 20k
    // links would materialise 30k+ rows just to render 500 nodes.
    //
    // Each kind now caps at `nodeCap` rows at the DB layer (the
    // in-memory `capNodes` still runs for the proportional
    // fair-share clip, but its input is bounded). Link tables cap
    // at `LINK_CAP_MULTIPLIER × nodeCap` because edge surface
    // grows faster than node count; 4× is the conservative
    // headroom that mirrors what the soft cap saw before this
    // change for realistic tenants.
    const nodeCap = options.nodeCap ?? DEFAULT_NODE_CAP;
    const linkCap = nodeCap * LINK_CAP_MULTIPLIER;

    return runInTenantContext(ctx, async (db) => {
        // Run the entity + link reads in parallel — the bottleneck is
        // the link table joins, not the entity fetches. Each respects RLS
        // independently; explicit `tenantId` filter is defence-in-
        // depth, matching every other usecase in this layer.
        const [
            controls,
            risks,
            assets,
            riskControls,
            controlAssets,
            assetRisks,
            controlRequirementLinks,
            policyControlLinks,
        ] = await Promise.all([
            wantKinds && !wantKinds.has('control')
                ? Promise.resolve([] as RawControl[])
                : db.control.findMany({
                      where: { tenantId: ctx.tenantId },
                      select: { id: true, code: true, name: true, status: true },
                      take: nodeCap,
                  }),
            wantKinds && !wantKinds.has('risk')
                ? Promise.resolve([] as RawRisk[])
                : db.risk.findMany({
                      where: { tenantId: ctx.tenantId },
                      select: {
                          id: true,
                          title: true,
                          score: true,
                          status: true,
                          category: true,
                      },
                      take: nodeCap,
                  }),
            wantKinds && !wantKinds.has('asset')
                ? Promise.resolve([] as RawAsset[])
                : db.asset.findMany({
                      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
                      select: {
                          id: true,
                          name: true,
                          type: true,
                          criticality: true,
                          status: true,
                      },
                      take: nodeCap,
                  }),
            db.riskControl.findMany({
                where: { tenantId: ctx.tenantId },
                select: { id: true, riskId: true, controlId: true },
                take: linkCap,
            }),
            db.controlAsset.findMany({
                where: { tenantId: ctx.tenantId },
                select: {
                    id: true,
                    controlId: true,
                    assetId: true,
                    coverageType: true,
                },
                take: linkCap,
            }),
            db.assetRiskLink.findMany({
                where: { tenantId: ctx.tenantId },
                select: {
                    id: true,
                    assetId: true,
                    riskId: true,
                    exposureLevel: true,
                },
                take: linkCap,
            }),
            // Gated on the requirement kind — mirrors the node fetches:
            // when the caller filters requirements out there's no point
            // materialising the control→requirement link rows.
            wantKinds && !wantKinds.has('requirement')
                ? Promise.resolve(
                      [] as { id: string; controlId: string; requirementId: string }[],
                  )
                : db.controlRequirementLink.findMany({
                      where: { tenantId: ctx.tenantId },
                      select: { id: true, controlId: true, requirementId: true },
                      take: linkCap,
                  }),
            // Gated on the policy kind — mirrors the requirement gating.
            wantKinds && !wantKinds.has('policy')
                ? Promise.resolve(
                      [] as { id: string; policyId: string; controlId: string }[],
                  )
                : db.policyControlLink.findMany({
                      where: { tenantId: ctx.tenantId },
                      select: { id: true, policyId: true, controlId: true },
                      take: linkCap,
                  }),
        ]);

        // Fetch ONLY the requirements actually linked to a control, so
        // the requirement column isn't flooded with the tenant's entire
        // framework corpus. FrameworkRequirement is a global (non-tenant)
        // model — tenant scoping is carried by the link rows above.
        const linkedRequirementIds = [
            ...new Set(controlRequirementLinks.map((l) => l.requirementId)),
        ];
        const requirements: RawRequirement[] =
            linkedRequirementIds.length === 0
                ? []
                : await db.frameworkRequirement.findMany({
                      where: { id: { in: linkedRequirementIds } },
                      select: {
                          id: true,
                          code: true,
                          title: true,
                          framework: { select: { name: true } },
                      },
                      take: nodeCap,
                  });

        // Fetch ONLY the policies actually linked to a control (mirrors the
        // requirement approach) so the policy column isn't flooded. Policy IS
        // tenant-scoped (unlike the global requirement corpus); still filter
        // by tenant + soft-delete for defence-in-depth.
        const linkedPolicyIds = [
            ...new Set(policyControlLinks.map((l) => l.policyId)),
        ];
        const policies: RawPolicy[] =
            linkedPolicyIds.length === 0
                ? []
                : await db.policy.findMany({
                      where: { tenantId: ctx.tenantId, deletedAt: null, id: { in: linkedPolicyIds } },
                      select: { id: true, title: true, category: true, status: true },
                      take: nodeCap,
                  });

        // Tag each link with its semantic relation. The graph
        // builder sees these as one homogeneous list and just
        // filters by surviving endpoint set.
        const links: RawLink[] = [
            ...riskControls.map((l) => ({
                id: `rc:${l.id}`,
                a: l.controlId,
                b: l.riskId,
                relation: 'mitigates' as const,
                qualifier: null,
            })),
            ...controlAssets.map((l) => ({
                id: `ca:${l.id}`,
                a: l.controlId,
                b: l.assetId,
                relation: 'protects' as const,
                qualifier: l.coverageType,
            })),
            ...assetRisks.map((l) => ({
                id: `ar:${l.id}`,
                a: l.assetId,
                b: l.riskId,
                relation: 'exposes' as const,
                qualifier: l.exposureLevel,
            })),
            ...controlRequirementLinks.map((l) => ({
                id: `crl:${l.id}`,
                a: l.controlId,
                b: l.requirementId,
                relation: 'implements' as const,
                qualifier: null,
            })),
            // Policy governs control (a=policy governs b=control).
            ...policyControlLinks.map((l) => ({
                id: `pcl:${l.id}`,
                a: l.policyId,
                b: l.controlId,
                relation: 'governs' as const,
                qualifier: null,
            })),
        ];

        return buildTraceabilityGraph({
            // ctx.tenantSlug is optional on the type; the route
            // path always includes it, so a missing value here is
            // a programmer error. Fall back to '' so href generation
            // produces a clearly-broken link rather than crashing.
            tenantSlug: ctx.tenantSlug ?? '',
            controls,
            risks,
            assets,
            requirements,
            policies,
            links,
            filters,
            nodeCap: options.nodeCap ?? DEFAULT_NODE_CAP,
        });
    });
}
