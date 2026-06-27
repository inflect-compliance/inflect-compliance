/**
 * Org-wide threat level — human-curated situational signal.
 *
 * Concept ported from Cybether (github.com/jccyberx/Cybether, MIT) — the
 * IDEA of a manually-set threat indicator, reimplemented native to this
 * stack as the data behind the ORG_THREAT_LEVEL dashboard widget.
 *
 * Scope: ORG-WIDE-SINGLE. One org → one current posture, set by an org
 * admin, shown to everyone viewing the org dashboard. (A per-tenant
 * threat level with a portfolio rollup is a heavier alternative; the
 * org-wide-single model matches the "one curated signal" intent.)
 *
 * Org-scoped (organizationId, global prisma, NOT tenant-scoped) — so no
 * RLS / Epic-B tenant-DEK applies (that machinery is tenant-keyed). The
 * curated free text is sanitised at this layer, matching the other
 * org-* models. Setting the posture is a SUBSTANTIVE action, so it
 * audits via ORG_THREAT_LEVEL_SET.
 */
import type { OrgThreatTier } from '@prisma/client';

import prisma from '@/lib/prisma';
import { OrgContext } from '../types';
import { forbidden, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { appendOrgAuditEntry } from '@/lib/audit/org-audit-writer';
import { logger } from '@/lib/observability/logger';

export const ORG_THREAT_TIERS = ['GUARDED', 'LOW', 'ELEVATED', 'HIGH', 'SEVERE'] as const;

export interface OrgThreatLevelDto {
    level: OrgThreatTier;
    summary: string;
    detail: string | null;
    setAt: string | null;
    setByUserId: string | null;
    setByName: string | null;
    /** True when no posture has been set — the GUARDED default is shown. */
    isDefault: boolean;
}

const DEFAULT_THREAT: OrgThreatLevelDto = {
    level: 'GUARDED',
    summary: 'No active threat assessment',
    detail: null,
    setAt: null,
    setByUserId: null,
    setByName: null,
    isDefault: true,
};

async function resolveUserName(userId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
    });
    return u?.name ?? u?.email ?? null;
}

/** Current posture — most-recent row, or the GUARDED default. Read access. */
export async function getCurrentOrgThreatLevel(ctx: OrgContext): Promise<OrgThreatLevelDto> {
    if (!ctx.permissions.canViewPortfolio) {
        throw forbidden('You do not have access to this organization dashboard.');
    }
    const row = await prisma.orgThreatLevel.findFirst({
        where: { organizationId: ctx.organizationId },
        orderBy: { setAt: 'desc' },
    });
    if (!row) return DEFAULT_THREAT;
    return {
        level: row.level,
        summary: row.summary,
        detail: row.detail,
        setAt: row.setAt.toISOString(),
        setByUserId: row.setByUserId,
        setByName: await resolveUserName(row.setByUserId),
        isDefault: false,
    };
}

/**
 * Set the org-wide threat posture (append a history row). Privileged:
 * `canSetThreatLevel` (ORG_ADMIN). Sanitises the curated text and emits
 * an ORG_THREAT_LEVEL_SET audit entry.
 */
export async function setOrgThreatLevel(
    ctx: OrgContext,
    input: { level: OrgThreatTier; summary: string; detail?: string | null },
): Promise<OrgThreatLevelDto> {
    if (!ctx.permissions.canSetThreatLevel) {
        throw forbidden('Only an organization admin can set the threat level.');
    }
    if (!(ORG_THREAT_TIERS as readonly string[]).includes(input.level)) {
        throw badRequest(`Invalid threat level "${input.level}".`);
    }
    const summary = sanitizePlainText(input.summary ?? '').trim();
    if (!summary) {
        throw badRequest('A threat-level summary is required.');
    }
    const detail =
        input.detail != null && input.detail.trim() !== ''
            ? sanitizePlainText(input.detail)
            : null;

    const row = await prisma.orgThreatLevel.create({
        data: {
            organizationId: ctx.organizationId,
            level: input.level,
            summary,
            detail,
            setByUserId: ctx.userId,
        },
    });

    // Substantive action → audit (fail-safe; never undo the write).
    try {
        await appendOrgAuditEntry({
            organizationId: ctx.organizationId,
            actorUserId: ctx.userId,
            actorType: 'USER',
            action: 'ORG_THREAT_LEVEL_SET',
            targetUserId: null,
            detailsJson: { level: input.level, threatLevelId: row.id },
            requestId: ctx.requestId,
        });
    } catch (err) {
        logger.warn('org-threat-level.audit_emit_failed', {
            component: 'org-threat-level',
            organizationId: ctx.organizationId,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return {
        level: row.level,
        summary: row.summary,
        detail: row.detail,
        setAt: row.setAt.toISOString(),
        setByUserId: row.setByUserId,
        setByName: await resolveUserName(row.setByUserId),
        isDefault: false,
    };
}

/** Full posture history, newest first (for the widget's Sheet timeline). */
export async function getOrgThreatLevelHistory(
    ctx: OrgContext,
    limit = 50,
): Promise<OrgThreatLevelDto[]> {
    if (!ctx.permissions.canViewPortfolio) {
        throw forbidden('You do not have access to this organization dashboard.');
    }
    const rows = await prisma.orgThreatLevel.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { setAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
    });
    // Batch-resolve names (no N+1).
    const ids = [...new Set(rows.map((r) => r.setByUserId))];
    const users = ids.length
        ? await prisma.user.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true, email: true },
          })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? null]));
    return rows.map((r) => ({
        level: r.level,
        summary: r.summary,
        detail: r.detail,
        setAt: r.setAt.toISOString(),
        setByUserId: r.setByUserId,
        setByName: nameById.get(r.setByUserId) ?? null,
        isDefault: false,
    }));
}
