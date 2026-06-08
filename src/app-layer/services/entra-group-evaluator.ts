/**
 * EI-2 — Entra group → IC role evaluator.
 *
 * Pure decision core: given the tenant's mapping table + the user's AAD group
 * claim, decide which IC role (if any) the user should hold. No writes — the
 * write side lives in `entra-group-mapper.ts`. Exhaustively unit-tested.
 *
 * Rules:
 *   1. Only `isActive` mappings are considered.
 *   2. Among mappings whose `aadGroupId` is in the user's groups, the
 *      highest `priority` wins; ties break by IC role *severity*
 *      (OWNER > ADMIN > EDITOR > READER > AUDITOR).
 *   3. No match → `null` when the gate is off (existing role preserved),
 *      or `{ matched: false, deny: true }` when `enforceGroupGate` is on.
 *   4. Empty group list → `null` (never `deny` — a user with no groups is
 *      indistinguishable from a claim that didn't populate; fail safe).
 */
import type { PrismaTx } from '@/lib/db-context';
import type { RequestContext } from '../types';
import type { Role } from '@prisma/client';
import { parseEntraConfig } from '../schemas/entra-provider.schemas';

/** Higher = more privileged. Drives the priority-tie break. */
const ROLE_SEVERITY: Record<Role, number> = {
    OWNER: 5,
    ADMIN: 4,
    EDITOR: 3,
    READER: 2,
    AUDITOR: 1,
};

export interface MappingRow {
    id: string;
    aadGroupId: string;
    icRole: Role;
    customRoleId: string | null;
    priority: number;
    isActive: boolean;
}

export interface GroupEvalResult {
    matched: boolean;
    deny?: boolean;
    icRole?: Role;
    customRoleId?: string | null;
    matchedGroupId?: string;
    matchedMappingId?: string;
}

/**
 * Pure — pick the winning mapping for a user's groups, or null if none match.
 * Active-only; highest priority, then highest role severity.
 */
export function pickMapping(
    mappings: MappingRow[],
    aadGroups: string[],
): MappingRow | null {
    const groupSet = new Set(aadGroups);
    const candidates = mappings.filter((m) => m.isActive && groupSet.has(m.aadGroupId));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) =>
        b.priority - a.priority || ROLE_SEVERITY[b.icRole] - ROLE_SEVERITY[a.icRole],
    );
    return candidates[0];
}

/**
 * Evaluate the user's groups against the tenant's mapping table. Reads the
 * mappings + the provider's `enforceGroupGate`. Returns null for "no change".
 */
export async function evaluateGroupMapping(
    db: PrismaTx,
    ctx: RequestContext,
    aadGroups: string[],
): Promise<GroupEvalResult | null> {
    if (!aadGroups || aadGroups.length === 0) return null;

    const mappings = (await db.entraGroupMapping.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: {
            id: true,
            aadGroupId: true,
            icRole: true,
            customRoleId: true,
            priority: true,
            isActive: true,
        },
    })) as MappingRow[];

    const winner = pickMapping(mappings, aadGroups);
    if (winner) {
        return {
            matched: true,
            icRole: winner.icRole,
            customRoleId: winner.customRoleId,
            matchedGroupId: winner.aadGroupId,
            matchedMappingId: winner.id,
        };
    }

    // No match — consult the gate.
    const provider = await db.tenantIdentityProvider.findFirst({
        where: { tenantId: ctx.tenantId, type: 'ENTRA_ID' },
        select: { configJson: true },
    });
    const enforce = parseEntraConfig(provider?.configJson)?.enforceGroupGate ?? false;
    return enforce ? { matched: false, deny: true } : null;
}
