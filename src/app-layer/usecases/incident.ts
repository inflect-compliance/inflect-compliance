/**
 * NIS2 Article 23 incident-response workflow.
 *
 * A live security incident is DISTINCT from a Finding (an audit
 * observation): an Incident is a real-time security event whose
 * `detectedAt` clock drives the Article 23 regulatory notification
 * deadlines (24h early warning / 72h detailed report / 1-month final).
 *
 * The seven-phase flow (DETECTION → … → RECOVERY → CLOSED) plus the
 * notification-deadline clock are the methodology adapted (CC BY 4.0)
 * from Kshreenath/NIS2-Checklist — Paolo Carner / BARE Consulting.
 *
 * NOT legal advice: the reportability heuristic + deadlines are
 * operational aids. `markReportable` requires an explicit human
 * decision; the tenant's DPO/legal owns the actual obligation.
 */
import { RequestContext } from '../types';
import { IncidentRepository } from '../repositories/IncidentRepository';
import {
    assertCanViewIncidents,
    assertCanManageIncidents,
} from '../policies/incident.policies';
import { logEvent } from '../events/audit';
import { notFound, badRequest } from '@/lib/errors/types';
import { runInTenantContext, PrismaTx } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { computeDeadlines, nextPhase, suggestsReportable } from '@/lib/incidents/deadlines';
import type { IncidentPhase, IncidentSeverity } from '@prisma/client';
import type {
    CreateIncidentInput,
    UpdateIncidentInput,
    AdvancePhaseInput,
    MarkReportableInput,
    SubmitNotificationInput,
    AddTimelineEntryInput,
    LinkControlsInput,
} from '../schemas/incident.schemas';

/** sanitize an optional free-text field, preserving the three-state contract. */
function sanitizeOptional(v: string | null | undefined): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return sanitizePlainText(v);
}

// ─── Reads ──────────────────────────────────────────────────────────

export async function listIncidents(
    ctx: RequestContext,
    options: { take?: number } = {},
) {
    assertCanViewIncidents(ctx);
    return runInTenantContext(ctx, (db) => IncidentRepository.list(db, ctx, options));
}

export async function getIncident(ctx: RequestContext, id: string) {
    assertCanViewIncidents(ctx);
    return runInTenantContext(ctx, async (db) => {
        const incident = await IncidentRepository.getById(db, ctx, id);
        if (!incident) throw notFound('Incident not found');
        return incident;
    });
}

// ─── Create / update ────────────────────────────────────────────────

export async function createIncident(ctx: RequestContext, data: CreateIncidentInput) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const detectedAt = data.detectedAt ? new Date(data.detectedAt) : new Date();
        const year = detectedAt.getUTCFullYear();
        const reference = await IncidentRepository.nextReference(db, ctx, year);

        const incident = await IncidentRepository.create(db, ctx, {
            reference,
            title: sanitizePlainText(data.title),
            description: data.description ? sanitizePlainText(data.description) : '',
            severity: data.severity as IncidentSeverity,
            incidentType: data.incidentType,
            phase: 'DETECTION',
            detectedAt,
            ownerUserId: data.ownerUserId || null,
            linkedControlIds: data.linkedControlIds ?? [],
            createdByUserId: ctx.userId,
        });

        await IncidentRepository.addTimelineEntry(db, ctx, {
            incidentId: incident.id,
            actorUserId: ctx.userId,
            entry: `Incident ${reference} opened (severity ${data.severity}, type ${data.incidentType}).`,
            phaseAtTime: 'DETECTION',
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Incident',
            entityId: incident.id,
            details: `Opened incident: ${reference} — ${incident.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Incident',
                operation: 'created',
                after: {
                    reference,
                    severity: data.severity,
                    incidentType: data.incidentType,
                },
                summary: `Opened incident ${reference}`,
            },
        });

        return incident;
    });
}

export async function updateIncident(
    ctx: RequestContext,
    id: string,
    data: UpdateIncidentInput,
) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const updated = await IncidentRepository.update(db, ctx, id, {
            title: data.title !== undefined ? sanitizePlainText(data.title) : undefined,
            description: sanitizeOptional(data.description) ?? undefined,
            severity: data.severity as IncidentSeverity | undefined,
            incidentType: data.incidentType,
            ownerUserId: data.ownerUserId === undefined ? undefined : data.ownerUserId,
            containedAt:
                data.containedAt === undefined
                    ? undefined
                    : data.containedAt === null
                      ? null
                      : new Date(data.containedAt),
            resolvedAt:
                data.resolvedAt === undefined
                    ? undefined
                    : data.resolvedAt === null
                      ? null
                      : new Date(data.resolvedAt),
        });
        if (!updated) throw notFound('Incident not found');

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Incident',
            entityId: id,
            details: `Updated incident: ${updated.reference}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Incident',
                operation: 'updated',
                summary: `Updated incident ${updated.reference}`,
            },
        });

        return updated;
    });
}

// ─── Seven-phase workflow ───────────────────────────────────────────

export async function advancePhase(
    ctx: RequestContext,
    id: string,
    input: AdvancePhaseInput,
) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const incident = await IncidentRepository.getById(db, ctx, id);
        if (!incident) throw notFound('Incident not found');

        const target: IncidentPhase | null = input.toPhase ?? nextPhase(incident.phase);
        if (!target) {
            throw badRequest('Incident is already in its final phase (CLOSED).');
        }
        if (target === incident.phase) {
            throw badRequest('Incident is already in that phase.');
        }

        const updated = await IncidentRepository.update(db, ctx, id, { phase: target });

        await IncidentRepository.addTimelineEntry(db, ctx, {
            incidentId: id,
            actorUserId: ctx.userId,
            entry: input.note
                ? `Phase advanced ${incident.phase} → ${target}. ${sanitizePlainText(input.note)}`
                : `Phase advanced ${incident.phase} → ${target}.`,
            phaseAtTime: target,
        });

        await logEvent(db, ctx, {
            action: 'STATUS_CHANGE',
            entityType: 'Incident',
            entityId: id,
            details: `Incident ${incident.reference} phase ${incident.phase} → ${target}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Incident',
                operation: 'phase_advanced',
                before: { phase: incident.phase },
                after: { phase: target },
                summary: `Phase ${incident.phase} → ${target}`,
            },
        });

        return updated;
    });
}

// ─── Reportability — the regulatory trigger ─────────────────────────

/**
 * Mark whether NIS2 Article 23 notification is required for this
 * incident. `input.reportable` is the explicit HUMAN decision (the
 * `suggestsReportable` heuristic only suggests). Marking reportable
 * creates the three notification deadlines (24h / 72h / 1 month),
 * derived from the incident's detectedAt.
 */
export async function markReportable(
    ctx: RequestContext,
    id: string,
    input: MarkReportableInput,
) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const incident = await IncidentRepository.getById(db, ctx, id);
        if (!incident) throw notFound('Incident not found');

        const updated = await IncidentRepository.update(db, ctx, id, {
            reportable: input.reportable,
        });

        if (input.reportable) {
            // Create the three deadlines (idempotent — skipDuplicates).
            const deadlines = computeDeadlines(incident.detectedAt);
            await IncidentRepository.createNotifications(db, ctx, id, deadlines);
            // Any previously NOT_REQUIRED rows (a prior un-mark) become
            // live again.
            await db.incidentNotification.updateMany({
                where: { tenantId: ctx.tenantId, incidentId: id, status: 'NOT_REQUIRED' },
                data: { status: 'PENDING' },
            });
        } else {
            // Stop the clock: pending/due/overdue deadlines become
            // NOT_REQUIRED. Already-SUBMITTED rows are left as history.
            await db.incidentNotification.updateMany({
                where: {
                    tenantId: ctx.tenantId,
                    incidentId: id,
                    status: { in: ['PENDING', 'DUE', 'OVERDUE'] },
                },
                data: { status: 'NOT_REQUIRED' },
            });
        }

        await IncidentRepository.addTimelineEntry(db, ctx, {
            incidentId: id,
            actorUserId: ctx.userId,
            entry: input.reportable
                ? `Marked REPORTABLE under NIS2 Article 23 — 24h / 72h / 1-month deadlines started.${input.note ? ' ' + sanitizePlainText(input.note) : ''}`
                : `Marked NOT reportable — Article 23 deadlines stopped.${input.note ? ' ' + sanitizePlainText(input.note) : ''}`,
            phaseAtTime: incident.phase,
        });

        await logEvent(db, ctx, {
            action: 'STATUS_CHANGE',
            entityType: 'Incident',
            entityId: id,
            details: `Incident ${incident.reference} reportable=${input.reportable}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Incident',
                operation: 'reportable_set',
                after: { reportable: input.reportable },
                summary: `Set reportable=${input.reportable} for ${incident.reference}`,
            },
        });

        return updated;
    });
}

// ─── File a regulatory notification ─────────────────────────────────

export async function submitNotification(
    ctx: RequestContext,
    id: string,
    input: SubmitNotificationInput,
) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const incident = await IncidentRepository.getById(db, ctx, id);
        if (!incident) throw notFound('Incident not found');

        const notification = await IncidentRepository.getNotification(db, ctx, id, input.kind);
        if (!notification) {
            throw badRequest(
                'No such notification deadline. Mark the incident reportable first.',
            );
        }

        const now = new Date();
        await IncidentRepository.updateNotification(db, ctx, notification.id, {
            status: 'SUBMITTED',
            submittedAt: now,
            submissionNote: sanitizePlainText(input.reportText),
            submissionRef: input.submissionRef ?? null,
        });

        // First filed report stamps the incident's reportedAt.
        if (!incident.reportedAt) {
            await IncidentRepository.update(db, ctx, id, { reportedAt: now });
        }

        await IncidentRepository.addTimelineEntry(db, ctx, {
            incidentId: id,
            actorUserId: ctx.userId,
            entry: `Filed ${input.kind} notification${input.submissionRef ? ` (ref ${sanitizePlainText(input.submissionRef)})` : ''}.`,
            phaseAtTime: incident.phase,
        });

        await logEvent(db, ctx, {
            action: 'STATUS_CHANGE',
            entityType: 'IncidentNotification',
            entityId: notification.id,
            details: `Submitted ${input.kind} for incident ${incident.reference}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'IncidentNotification',
                operation: 'submitted',
                after: { kind: input.kind, status: 'SUBMITTED' },
                summary: `Submitted ${input.kind} for ${incident.reference}`,
            },
        });

        return { ok: true };
    });
}

// ─── Timeline + control links ───────────────────────────────────────

export async function addTimelineEntry(
    ctx: RequestContext,
    id: string,
    input: AddTimelineEntryInput,
) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const incident = await IncidentRepository.getById(db, ctx, id);
        if (!incident) throw notFound('Incident not found');

        const entry = await IncidentRepository.addTimelineEntry(db, ctx, {
            incidentId: id,
            actorUserId: ctx.userId,
            entry: sanitizePlainText(input.entry),
            phaseAtTime: incident.phase,
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'IncidentTimelineEntry',
            entityId: entry.id,
            details: `Timeline entry added to incident ${incident.reference}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'IncidentTimelineEntry',
                operation: 'created',
                summary: `Timeline entry on ${incident.reference}`,
            },
        });

        return entry;
    });
}

export async function linkControls(
    ctx: RequestContext,
    id: string,
    input: LinkControlsInput,
) {
    assertCanManageIncidents(ctx);

    return runInTenantContext(ctx, async (db) => {
        const incident = await IncidentRepository.getById(db, ctx, id);
        if (!incident) throw notFound('Incident not found');

        // Validate the controls belong to this tenant — never store a
        // foreign control id.
        const valid = await db.control.findMany({
            where: { tenantId: ctx.tenantId, id: { in: input.controlIds } },
            select: { id: true },
        });
        const validIds = valid.map((c) => c.id);

        const updated = await IncidentRepository.update(db, ctx, id, {
            linkedControlIds: validIds,
        });

        await IncidentRepository.addTimelineEntry(db, ctx, {
            incidentId: id,
            actorUserId: ctx.userId,
            entry: `Linked ${validIds.length} Art.21(2) control(s).`,
            phaseAtTime: incident.phase,
        });

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Incident',
            entityId: id,
            details: `Linked controls to incident ${incident.reference}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Incident',
                operation: 'controls_linked',
                after: { linkedControlIds: validIds },
                summary: `Linked ${validIds.length} control(s) to ${incident.reference}`,
            },
        });

        return updated;
    });
}

export type IncidentDb = PrismaTx;
