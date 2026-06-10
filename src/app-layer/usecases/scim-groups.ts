/**
 * EI-3 — SCIM 2.0 Groups provisioning.
 *
 * Entra pushes group lifecycle (create / member add / member remove / rename)
 * to IC via SCIM. A `ScimGroup` row mirrors the Entra group; member changes
 * reconcile each affected user's `TenantMembership` through the EI-2 engine
 * (`syncEntraMembershipRole`) for near-real-time (de)provisioning —
 * complementing the pull-based sign-in claim path.
 *
 * RLS: `ScimGroup` is FORCE-RLS'd, so reads/writes run inside
 * `runInTenantContext`. The membership reconciliation runs AFTER the group
 * mutation commits (outside that context) so `syncEntraMembershipRole` owns its
 * own tenant context — no nested transactions.
 *
 * (Re-implemented on the current `TenantEntraGroupMapping` model + the shared
 * `syncEntraMembershipRole` engine; the original EI-3 branch predated both.)
 */
import { runInTenantContext } from '@/lib/db-context';
import prisma from '@/lib/prisma';
import type { RequestContext } from '../types';
import { syncEntraMembershipRole } from '@/lib/auth/entra-group-sync';

export interface ScimContext {
    tenantId: string;
}

interface ScimMember {
    value: string; // SCIM member value = user externalId (AAD oid)
    display?: string;
}

const ctxOf = (c: ScimContext) =>
    ({ tenantId: c.tenantId, userId: null } as unknown as RequestContext);

export function scimGroupResource(g: {
    id: string;
    externalId: string;
    displayName: string;
    membersJson: unknown;
}) {
    return {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: g.id,
        externalId: g.externalId,
        displayName: g.displayName,
        members: Array.isArray(g.membersJson) ? g.membersJson : [],
        meta: { resourceType: 'Group' },
    };
}

export async function scimListGroups(ctx: ScimContext) {
    return runInTenantContext(ctxOf(ctx), (db) =>
        db.scimGroup.findMany({ where: { tenantId: ctx.tenantId }, take: 200 }),
    );
}

export async function scimGetGroup(ctx: ScimContext, id: string) {
    return runInTenantContext(ctxOf(ctx), (db) =>
        db.scimGroup.findFirst({ where: { id, tenantId: ctx.tenantId } }),
    );
}

export async function scimCreateGroup(
    ctx: ScimContext,
    input: { externalId: string; displayName: string; members?: ScimMember[] },
) {
    const memberExternalIds = (input.members ?? []).map((m) => m.value);
    const userIds = await resolveUserIds(ctx.tenantId, memberExternalIds);

    const group = await runInTenantContext(ctxOf(ctx), (db) =>
        db.scimGroup.create({
            data: {
                tenantId: ctx.tenantId,
                externalId: input.externalId,
                displayName: input.displayName,
                memberIds: userIds,
                membersJson: (input.members ?? []) as never,
            },
        }),
    );
    await reconcileUsers(ctx.tenantId, userIds);
    return group;
}

/** PUT — full replace of displayName + members. */
export async function scimReplaceGroup(
    ctx: ScimContext,
    id: string,
    input: { displayName?: string; members?: ScimMember[] },
) {
    const memberExternalIds = (input.members ?? []).map((m) => m.value);
    const userIds = await resolveUserIds(ctx.tenantId, memberExternalIds);

    const { affected } = await runInTenantContext(ctxOf(ctx), async (db) => {
        const existing = await db.scimGroup.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!existing) return { group: null, affected: [] as string[] };
        const group = await db.scimGroup.update({
            where: { id },
            data: {
                ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
                ...(input.members !== undefined
                    ? { memberIds: userIds, membersJson: input.members as never }
                    : {}),
            },
        });
        // union of old + new members must be re-evaluated
        const affected = Array.from(new Set([...existing.memberIds, ...userIds]));
        return { group, affected };
    });
    await reconcileUsers(ctx.tenantId, affected);
    return scimGetGroup(ctx, id);
}

/**
 * PATCH — RFC 7644 PatchOp. Supports member add/remove + displayName replace.
 */
export async function scimPatchGroup(
    ctx: ScimContext,
    id: string,
    ops: Array<{ op: string; path?: string; value?: unknown }>,
) {
    const affected = new Set<string>();

    await runInTenantContext(ctxOf(ctx), async (db) => {
        const group = await db.scimGroup.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!group) return;
        let memberIds = [...group.memberIds];
        let displayName = group.displayName;

        for (const op of ops) {
            const path = (op.path ?? '').toLowerCase();
            if (path === 'members' || path === '') {
                if (op.op === 'add') {
                    const ext = membersOf(op.value).map((m) => m.value);
                    const uids = await resolveUserIds(ctx.tenantId, ext, db);
                    for (const u of uids) { if (!memberIds.includes(u)) memberIds.push(u); affected.add(u); }
                } else if (op.op === 'remove') {
                    const ext = membersOf(op.value).map((m) => m.value);
                    const uids = await resolveUserIds(ctx.tenantId, ext, db);
                    memberIds = memberIds.filter((m) => !uids.includes(m));
                    uids.forEach((u) => affected.add(u));
                }
            } else if (path === 'displayname' && op.op === 'replace') {
                displayName = String(op.value ?? displayName);
            }
        }

        await db.scimGroup.update({
            where: { id },
            data: { memberIds, displayName },
        });
        // Keep the linked role mapping's cached display name in sync (UI only).
        await db.tenantEntraGroupMapping.updateMany({
            where: { tenantId: ctx.tenantId, aadGroupId: group.externalId },
            data: { aadGroupName: displayName },
        });
    });

    await reconcileUsers(ctx.tenantId, Array.from(affected));
    return scimGetGroup(ctx, id);
}

export async function scimDeleteGroup(ctx: ScimContext, id: string) {
    const { ok, members } = await runInTenantContext(ctxOf(ctx), async (db) => {
        const group = await db.scimGroup.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!group) return { ok: false, members: [] as string[] };
        await db.scimGroup.deleteMany({ where: { id, tenantId: ctx.tenantId } });
        // The role mapping itself is admin-curated (TenantEntraGroupMapping has
        // no active flag) — deleting the SCIM group just removes this membership
        // source. Reconcile the ex-members so they lose any role this group gave.
        return { ok: true, members: group.memberIds };
    });
    if (ok) await reconcileUsers(ctx.tenantId, members);
    return { ok };
}

// ─── helpers ───────────────────────────────────────────────────────────

function membersOf(value: unknown): ScimMember[] {
    if (Array.isArray(value)) return value as ScimMember[];
    if (value && typeof value === 'object' && 'value' in (value as object))
        return [value as ScimMember];
    return [];
}

/** Minimal structural db — satisfied by both the global client and a PrismaTx. */
type IdentityLinkDb = {
    userIdentityLink: {
        findMany(args: {
            where: { tenantId: string; externalSubject: { in: string[] } };
            select: { userId: true };
        }): Promise<Array<{ userId: string }>>;
    };
};

/** Resolve SCIM member externalIds (AAD oids) → IC User ids via UserIdentityLink. */
async function resolveUserIds(
    tenantId: string,
    externalSubjects: string[],
    db: IdentityLinkDb = prisma,
): Promise<string[]> {
    if (externalSubjects.length === 0) return [];
    const links = await db.userIdentityLink.findMany({
        where: { tenantId, externalSubject: { in: externalSubjects } },
        select: { userId: true },
    });
    return Array.from(new Set(links.map((l) => l.userId)));
}

/**
 * Recompute each affected user's group membership from ALL their ScimGroups,
 * then reconcile their role through the EI-2 engine. Runs outside the group
 * mutation's tenant context so `syncEntraMembershipRole` owns its own.
 */
async function reconcileUsers(tenantId: string, userIds: string[]): Promise<void> {
    // `userIds` is a single SCIM op's member delta (typically 1, bounded by the
    // push payload). Each user's reconcile needs its OWN tenant context for the
    // sync call that follows; batching would cross-contaminate.
    for (const userId of userIds) { // guardrail-allow: n+1
        const groups = await runInTenantContext(
            { tenantId, userId: null } as unknown as RequestContext,
            (db) =>
                db.scimGroup.findMany({
                    where: { tenantId, memberIds: { has: userId } },
                    select: { externalId: true },
                }),
        );
        const aadGroups = groups.map((g) => g.externalId);
        await syncEntraMembershipRole({ userId, tenantId, aadGroups });
    }
}
