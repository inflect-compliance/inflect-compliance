/**
 * EI-2 — Entra group → IC role mapper (the write side).
 *
 * Called from the auth `signIn` callback and the `jwt` token-refresh path
 * (and EI-3 SCIM pushes). Evaluates the user's groups and reconciles their
 * `TenantMembership` accordingly.
 *
 * THE INVARIANT (privilege-escalation guard, enforced by the EI-4 ratchet):
 * a membership with `provisionedByEntraGroup = false` is MANUALLY curated and
 * MUST NEVER be mutated by this engine. Only auto-managed memberships
 * (`provisionedByEntraGroup = true`, or freshly created here) are reconciled.
 */
import { runInTenantContext } from '@/lib/db-context';
import { evaluateGroupMapping } from './entra-group-evaluator';
import type { RequestContext } from '../types';

export type EntraSyncSource = 'claim' | 'scim' | 'refresh';

export type ApplyOutcome =
    | 'created'
    | 'updated'
    | 'deactivated'
    | 'denied'
    | 'no_change'
    | 'skipped_manual';

export interface ApplyResult {
    outcome: ApplyOutcome;
    /** True only when the enforce-gate blocked a first-time membership. */
    deny?: boolean;
}

export async function applyEntraGroupMapping(
    userId: string,
    tenantId: string,
    aadGroups: string[],
    _source: EntraSyncSource = 'claim',
): Promise<ApplyResult> {
    const ctx = { userId, tenantId } as unknown as RequestContext;

    return runInTenantContext(ctx, async (db) => {
        const result = await evaluateGroupMapping(db, ctx, aadGroups);

        const existing = await db.tenantMembership.findFirst({
            where: { tenantId, userId },
            select: {
                id: true,
                role: true,
                customRoleId: true,
                provisionedByEntraGroup: true,
                status: true,
            },
        });

        // ── Case A — no membership yet ──
        if (!existing) {
            if (result?.deny) return { outcome: 'denied', deny: true };
            if (result?.matched && result.icRole) {
                await db.tenantMembership.create({
                    data: {
                        tenantId,
                        userId,
                        role: result.icRole,
                        customRoleId: result.customRoleId ?? null,
                        status: 'ACTIVE',
                        provisionedByEntraGroup: true,
                        lastEntraGroupMappingId: result.matchedMappingId ?? null,
                    },
                });
                return { outcome: 'created' };
            }
            return { outcome: 'no_change' };
        }

        // ── Case B — membership exists ──
        // THE INVARIANT: never touch a manually-provisioned membership.
        if (!existing.provisionedByEntraGroup) {
            return { outcome: 'skipped_manual' };
        }

        // Auto-managed from here on.
        if (result?.deny) {
            if (existing.status !== 'DEACTIVATED') {
                try {
                    await db.tenantMembership.update({
                        where: { id: existing.id },
                        data: { status: 'DEACTIVATED', deactivatedAt: new Date() },
                    });
                } catch {
                    // Last-OWNER guard (DB trigger P0001) — refuse to strand a
                    // tenant. Leave the membership; the audit surface flags it.
                    return { outcome: 'no_change' };
                }
            }
            return { outcome: 'deactivated' };
        }

        if (result?.matched && result.icRole) {
            const changed =
                existing.role !== result.icRole ||
                (existing.customRoleId ?? null) !== (result.customRoleId ?? null) ||
                existing.status !== 'ACTIVE';
            if (changed) {
                try {
                    await db.tenantMembership.update({
                        where: { id: existing.id },
                        data: {
                            role: result.icRole,
                            customRoleId: result.customRoleId ?? null,
                            status: 'ACTIVE',
                            lastEntraGroupMappingId: result.matchedMappingId ?? null,
                        },
                    });
                } catch {
                    return { outcome: 'no_change' };
                }
                return { outcome: 'updated' };
            }
            return { outcome: 'no_change' };
        }

        // No match + gate off → keep the last role (manual retention).
        return { outcome: 'no_change' };
    });
}
