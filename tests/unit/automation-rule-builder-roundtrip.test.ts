/**
 * Edit round-trip: opening a rule in the builder and saving with no changes
 * must PRESERVE its config (a no-op). Regression guard for the data-loss bug
 * where edit mode never hydrated from the rule and Save PUT blank defaults over
 * the stored config.
 *
 * Tests the pure seam: `buildRulePayload(detailToBuilderState(detail))` must
 * reproduce the detail's config for every action type + filter/sla/schedule/chain.
 */
import {
    detailToBuilderState,
    buildRulePayload,
    type RuleDetail,
} from '@/components/processes/RuleBuilderModal';

const cases: Array<{ name: string; detail: RuleDetail }> = [
    {
        name: 'NOTIFY_USER + OR filter + sla + breach + chain + else',
        detail: {
            name: 'Notify owner',
            triggerEvent: 'RISK_CREATED',
            actionType: 'NOTIFY_USER',
            triggerFilterJson: {
                logic: 'OR',
                conditions: [
                    { field: 'severity', operator: 'in', value: ['HIGH', 'CRITICAL'] },
                    { field: 'title', operator: 'contains', value: 'breach' },
                ],
            },
            actionConfigJson: { userIds: ['u1', 'u2'], message: 'Heads up', linkUrl: 'https://x/y' },
            slaWindowMinutes: 30,
            slaBreachActionType: 'NOTIFY_USER',
            slaBreachConfigJson: { userIds: ['u3'], message: 'Escalate' },
            scheduleConfigJson: null,
            nextRuleId: 'r2',
            nextRuleDelay: 15,
            elseRuleId: 'r3',
        },
    },
    {
        name: 'CREATE_TASK with severity/priority/assignee',
        detail: {
            name: 'Open follow-up',
            triggerEvent: 'CONTROL_FAILED',
            actionType: 'CREATE_TASK',
            triggerFilterJson: null,
            actionConfigJson: { title: 'Investigate', severity: 'HIGH', priority: 'P1', assigneeUserId: 'u9' },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: null,
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
    {
        name: 'UPDATE_STATUS',
        detail: {
            name: 'Auto-close',
            triggerEvent: 'RISK_MITIGATED',
            actionType: 'UPDATE_STATUS',
            triggerFilterJson: { logic: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'MITIGATED' }] },
            actionConfigJson: { entityType: 'Risk', field: 'status', toStatus: 'CLOSED' },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: null,
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
    {
        name: 'WEBHOOK',
        detail: {
            name: 'Ping SIEM',
            triggerEvent: 'INCIDENT_CREATED',
            actionType: 'WEBHOOK',
            triggerFilterJson: null,
            actionConfigJson: { url: 'https://siem.example.com/hook', method: 'PUT' },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: null,
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
    {
        name: 'WEBHOOK with headers + HMAC secretRef (PR2 superset)',
        detail: {
            name: 'Signed webhook',
            triggerEvent: 'INCIDENT_CREATED',
            actionType: 'WEBHOOK',
            triggerFilterJson: null,
            actionConfigJson: {
                url: 'https://siem.example.com/hook',
                method: 'POST',
                headers: { 'X-Api-Key': 'abc123', 'X-Source': 'inflect' },
                secretRef: 'WEBHOOK_HMAC',
            },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: null,
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
    {
        name: 'CREATE_TASK with link-to-entity (PR2 superset)',
        detail: {
            name: 'Linked follow-up',
            triggerEvent: 'RISK_CREATED',
            actionType: 'CREATE_TASK',
            triggerFilterJson: null,
            actionConfigJson: { title: 'Review', linkEntityType: 'Risk', linkEntityIdField: 'entityId' },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: null,
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
    {
        name: 'INVOKE_SUBFLOW (PR2 superset)',
        detail: {
            name: 'Escalation sub-flow',
            triggerEvent: 'RISK_CREATED',
            actionType: 'INVOKE_SUBFLOW',
            triggerFilterJson: null,
            actionConfigJson: { targetGroupId: 'grp-escalation' },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: null,
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
    {
        name: 'SCHEDULE trigger with schedule config',
        detail: {
            name: 'Evidence reminder',
            triggerEvent: 'SCHEDULE',
            actionType: 'NOTIFY_USER',
            triggerFilterJson: null,
            actionConfigJson: { userIds: ['u1'], message: 'Due soon' },
            slaWindowMinutes: null,
            slaBreachActionType: null,
            slaBreachConfigJson: null,
            scheduleConfigJson: { kind: 'DATE_RELATIVE', target: 'Evidence', offsetDays: 7 },
            nextRuleId: null,
            nextRuleDelay: null,
            elseRuleId: null,
        },
    },
];

describe('rule-builder edit round-trip (save with no changes is a no-op)', () => {
    it.each(cases)('$name preserves config', ({ detail }) => {
        const payload = buildRulePayload(detailToBuilderState(detail));
        expect(payload.name).toBe(detail.name);
        expect(payload.triggerEvent).toBe(detail.triggerEvent);
        expect(payload.actionType).toBe(detail.actionType);
        expect(payload.triggerFilter).toEqual(detail.triggerFilterJson);
        expect(payload.actionConfig).toEqual(detail.actionConfigJson);
        expect(payload.slaWindowMinutes).toBe(detail.slaWindowMinutes);
        expect(payload.slaBreachActionType).toBe(detail.slaBreachActionType);
        expect(payload.slaBreachConfig).toEqual(detail.slaBreachConfigJson);
        expect(payload.scheduleConfig).toEqual(detail.scheduleConfigJson);
        expect(payload.nextRuleId).toBe(detail.nextRuleId);
        expect(payload.nextRuleDelay).toBe(detail.nextRuleDelay);
        expect(payload.elseRuleId).toBe(detail.elseRuleId);
    });
});
