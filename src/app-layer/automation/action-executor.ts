/**
 * Automation action executor (Action Execution Engine).
 *
 * The piece the Epic 60 foundation deferred: this turns a matched rule into a
 * REAL side effect. The dispatchers (event / chain / sub-flow) call
 * `executeAction` after they claim an execution row; the result decides whether
 * the row settles SUCCEEDED or FAILED.
 *
 * Every action type is handled here — there is no longer a "no-op" branch. A
 * structural ratchet (tests/guards/automation-action-executor-coverage.test.ts)
 * fails CI if a new `AutomationActionType` is added without a handler, or if a
 * dispatcher regresses to a hardcoded outcome note.
 */
import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { enqueue } from '../jobs/queue';
import type {
    NotifyUserActionConfig,
    CreateTaskActionConfig,
    UpdateStatusActionConfig,
    WebhookActionConfig,
} from './types';

export interface ActionResult {
    ok: boolean;
    summary: string;
    detail?: Record<string, unknown>;
}

/** The slice of an AutomationRule the executor needs. */
export interface ExecutableRule {
    id: string;
    name: string;
    actionType: string;
    actionConfigJson: unknown;
    createdByUserId: string | null;
}

/** The slice of the firing event the executor needs. */
export interface ActionEvent {
    tenantId: string;
    event: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string | null;
    data?: Record<string, unknown>;
}

// A loose Prisma surface — the dispatchers pass the singleton client or a tx.
type Db = PrismaClient | Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const WEBHOOK_TIMEOUT_MS = 8000;

/**
 * Execute a rule's action. Never throws — failures are returned as
 * `{ ok: false }` so the dispatcher records a clean FAILED row.
 */
export async function executeAction(
    db: Db,
    rule: ExecutableRule,
    event: ActionEvent,
): Promise<ActionResult> {
    try {
        switch (rule.actionType) {
            case 'NOTIFY_USER':
                return await notifyUser(db, rule, event);
            case 'CREATE_TASK':
                return await createTask(db, rule, event);
            case 'UPDATE_STATUS':
                return await updateStatus(db, rule, event);
            case 'WEBHOOK':
                return await fireWebhook(rule, event);
            case 'INVOKE_SUBFLOW':
                return await invokeSubflow(rule, event);
            default:
                return { ok: false, summary: `Unknown action type: ${rule.actionType}` };
        }
    } catch (err) {
        return {
            ok: false,
            summary: `Action ${rule.actionType} failed: ${(err as Error).message}`,
        };
    }
}

async function notifyUser(db: Db, rule: ExecutableRule, event: ActionEvent): Promise<ActionResult> {
    const cfg = rule.actionConfigJson as NotifyUserActionConfig;
    const requested = Array.isArray(cfg?.userIds) ? cfg.userIds.filter(Boolean) : [];
    if (requested.length === 0) return { ok: true, summary: 'No recipients configured', detail: { notified: 0 } };
    // Only notify actual members of the firing tenant — drops stale/foreign ids
    // (tenant-isolation safety + avoids a dangling-FK insert).
    const members = await db.tenantMembership.findMany({
        where: { tenantId: event.tenantId, userId: { in: requested } },
        select: { userId: true },
    });
    const userIds = members.map((m: { userId: string }) => m.userId);
    if (userIds.length === 0) return { ok: true, summary: 'No valid recipients', detail: { notified: 0 } };
    await db.notification.createMany({
        data: userIds.map((userId: string) => ({
            tenantId: event.tenantId,
            userId,
            type: 'GENERAL',
            title: rule.name,
            message: cfg.message ?? rule.name,
            linkUrl: cfg.linkUrl ?? null,
        })),
        skipDuplicates: true,
    });
    return { ok: true, summary: `Notified ${userIds.length} user(s)`, detail: { notified: userIds.length } };
}

async function createTask(db: Db, rule: ExecutableRule, event: ActionEvent): Promise<ActionResult> {
    const cfg = rule.actionConfigJson as CreateTaskActionConfig;
    const createdByUserId = event.actorUserId ?? rule.createdByUserId;
    if (!createdByUserId) return { ok: false, summary: 'No actor to own the created task' };
    // Resolve an optional linked control from the event payload.
    const controlId =
        cfg.linkEntityType === 'Control' && cfg.linkEntityIdField
            ? (event.data?.[cfg.linkEntityIdField] as string | undefined) ?? null
            : null;
    const task = await db.task.create({
        data: {
            tenantId: event.tenantId,
            type: 'TASK',
            title: cfg.title ?? rule.name,
            severity: cfg.severity ?? 'MEDIUM',
            priority: cfg.priority ?? 'P2',
            status: 'OPEN',
            source: 'INTEGRATION',
            createdByUserId,
            assigneeUserId: cfg.assigneeUserId ?? null,
            controlId,
        },
    });
    return { ok: true, summary: `Created task ${task.id}`, detail: { taskId: task.id } };
}

async function updateStatus(db: Db, rule: ExecutableRule, event: ActionEvent): Promise<ActionResult> {
    const cfg = rule.actionConfigJson as UpdateStatusActionConfig;
    if (!event.entityId) return { ok: false, summary: 'Event carries no entityId to update' };
    const where = { id: event.entityId, tenantId: event.tenantId };
    const data = { [cfg.field]: cfg.toStatus };
    // Explicit per-model dispatch (no dynamic index) so the model name can
    // never be attacker-influenced and the call stays type-checked.
    let updated: number;
    switch (cfg?.entityType) {
        case 'Risk':
            updated = (await db.risk.updateMany({ where, data })).count;
            break;
        case 'Task':
            updated = (await db.task.updateMany({ where, data })).count;
            break;
        case 'Control':
            updated = (await db.control.updateMany({ where, data })).count;
            break;
        default:
            // 'Issue' has no standalone model (issues are Tasks via WorkItemType)
            // — unsupported here rather than guessing the backing table.
            return { ok: false, summary: `Unsupported entityType: ${cfg?.entityType}` };
    }
    return {
        ok: updated > 0,
        summary:
            updated > 0
                ? `Set ${cfg.entityType}.${cfg.field} = ${cfg.toStatus}`
                : `No ${cfg.entityType} matched ${event.entityId}`,
        detail: { updated },
    };
}

async function fireWebhook(rule: ExecutableRule, event: ActionEvent): Promise<ActionResult> {
    const cfg = rule.actionConfigJson as WebhookActionConfig;
    if (!cfg?.url) return { ok: false, summary: 'No webhook URL configured' };
    const body = JSON.stringify({
        rule: { id: rule.id, name: rule.name },
        event: { name: event.event, entityType: event.entityType, entityId: event.entityId },
        data: event.data ?? {},
    });
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Inflect-Automation/1',
        ...(cfg.headers ?? {}),
    };
    // Sign the body so the consumer can verify authenticity (mirrors the
    // audit-stream's X-Inflect-Signature contract).
    if (cfg.secretRef) {
        const sig = createHmac('sha256', cfg.secretRef).update(body).digest('hex');
        headers['X-Inflect-Signature'] = `sha256=${sig}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
        const res = await fetch(cfg.url, {
            method: cfg.method ?? 'POST',
            headers,
            body,
            signal: controller.signal,
        });
        return {
            ok: res.ok,
            summary: `Webhook ${cfg.url} → ${res.status}`,
            detail: { status: res.status },
        };
    } finally {
        clearTimeout(timer);
    }
}

async function invokeSubflow(rule: ExecutableRule, event: ActionEvent): Promise<ActionResult> {
    const cfg = rule.actionConfigJson as { targetGroupId?: string };
    if (!cfg?.targetGroupId) return { ok: false, summary: 'No sub-flow target configured' };
    // The chained execution is created by the subflow-dispatch job; here we
    // only enqueue it. parentExecutionId is wired by the caller via the event.
    await enqueue('subflow-dispatch', {
        tenantId: event.tenantId,
        targetGroupId: cfg.targetGroupId,
        parentExecutionId: (event.data?.__parentExecutionId as string) ?? '',
        triggerEvent: event.event,
        data: event.data ?? {},
    });
    return { ok: true, summary: `Enqueued sub-flow ${cfg.targetGroupId}` };
}
