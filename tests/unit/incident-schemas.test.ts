/**
 * Unit tests for the NIS2 incident-response Zod schemas.
 */
import {
    INCIDENT_SEVERITIES,
    INCIDENT_TYPES,
    INCIDENT_PHASES,
    INCIDENT_NOTIFICATION_KINDS,
    CreateIncidentSchema,
    UpdateIncidentSchema,
    AdvancePhaseSchema,
    MarkReportableSchema,
    SubmitNotificationSchema,
    AddTimelineEntrySchema,
    LinkControlsSchema,
    ToggleContainmentStepSchema,
    LinkEvidenceSchema,
} from '@/app-layer/schemas/incident.schemas';

describe('incident.schemas', () => {
    describe('const tuples', () => {
        it('exports the expected enum members', () => {
            expect(INCIDENT_SEVERITIES).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
            expect(INCIDENT_TYPES).toContain('RANSOMWARE');
            expect(INCIDENT_PHASES).toContain('CLOSED');
            expect(INCIDENT_NOTIFICATION_KINDS).toContain('DETAILED_72H');
        });
    });

    describe('CreateIncidentSchema', () => {
        it('accepts a minimal valid input', () => {
            const r = CreateIncidentSchema.safeParse({
                title: 'Ransomware on host A',
                severity: 'HIGH',
                incidentType: 'RANSOMWARE',
            });
            expect(r.success).toBe(true);
        });

        it('accepts a fully populated input', () => {
            const r = CreateIncidentSchema.parse({
                title: 'Breach',
                description: 'details',
                severity: 'CRITICAL',
                incidentType: 'DATA_BREACH',
                detectedAt: '2026-01-01T00:00:00.000Z',
                ownerUserId: 'user-1',
                linkedControlIds: ['c1', 'c2'],
            });
            expect(r.title).toBe('Breach');
            expect(r.ownerUserId).toBe('user-1');
        });

        it('accepts null ownerUserId', () => {
            const r = CreateIncidentSchema.safeParse({
                title: 'x',
                severity: 'LOW',
                incidentType: 'OTHER',
                ownerUserId: null,
            });
            expect(r.success).toBe(true);
        });

        it('rejects an empty title', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: '',
                    severity: 'LOW',
                    incidentType: 'OTHER',
                }).success,
            ).toBe(false);
        });

        it('rejects a title over 300 chars', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: 'a'.repeat(301),
                    severity: 'LOW',
                    incidentType: 'OTHER',
                }).success,
            ).toBe(false);
        });

        it('rejects a description over 20000 chars', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: 'x',
                    description: 'a'.repeat(20001),
                    severity: 'LOW',
                    incidentType: 'OTHER',
                }).success,
            ).toBe(false);
        });

        it('rejects an invalid severity', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: 'x',
                    severity: 'EXTREME',
                    incidentType: 'OTHER',
                }).success,
            ).toBe(false);
        });

        it('rejects an invalid incidentType', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: 'x',
                    severity: 'LOW',
                    incidentType: 'METEOR',
                }).success,
            ).toBe(false);
        });

        it('rejects a non-ISO detectedAt', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: 'x',
                    severity: 'LOW',
                    incidentType: 'OTHER',
                    detectedAt: 'not-a-date',
                }).success,
            ).toBe(false);
        });

        it('rejects more than 100 linkedControlIds', () => {
            expect(
                CreateIncidentSchema.safeParse({
                    title: 'x',
                    severity: 'LOW',
                    incidentType: 'OTHER',
                    linkedControlIds: Array.from({ length: 101 }, (_, i) => `c${i}`),
                }).success,
            ).toBe(false);
        });

        it('rejects a missing required field', () => {
            expect(CreateIncidentSchema.safeParse({ title: 'x' }).success).toBe(false);
        });
    });

    describe('UpdateIncidentSchema', () => {
        it('accepts an empty object (all optional)', () => {
            expect(UpdateIncidentSchema.safeParse({}).success).toBe(true);
        });

        it('accepts null containedAt/resolvedAt', () => {
            const r = UpdateIncidentSchema.safeParse({
                containedAt: null,
                resolvedAt: null,
            });
            expect(r.success).toBe(true);
        });

        it('accepts valid datetime fields', () => {
            const r = UpdateIncidentSchema.safeParse({
                title: 'updated',
                containedAt: '2026-01-02T00:00:00.000Z',
                resolvedAt: '2026-01-03T00:00:00.000Z',
            });
            expect(r.success).toBe(true);
        });

        it('rejects an empty title when provided', () => {
            expect(UpdateIncidentSchema.safeParse({ title: '' }).success).toBe(false);
        });

        it('rejects a bad containedAt datetime', () => {
            expect(
                UpdateIncidentSchema.safeParse({ containedAt: 'nope' }).success,
            ).toBe(false);
        });
    });

    describe('AdvancePhaseSchema', () => {
        it('accepts an empty object', () => {
            expect(AdvancePhaseSchema.safeParse({}).success).toBe(true);
        });

        it('accepts a valid toPhase + note', () => {
            expect(
                AdvancePhaseSchema.safeParse({ toPhase: 'CONTAINMENT', note: 'n' }).success,
            ).toBe(true);
        });

        it('rejects an invalid phase', () => {
            expect(AdvancePhaseSchema.safeParse({ toPhase: 'NOWHERE' }).success).toBe(false);
        });

        it('rejects a note over 5000 chars', () => {
            expect(
                AdvancePhaseSchema.safeParse({ note: 'a'.repeat(5001) }).success,
            ).toBe(false);
        });
    });

    describe('MarkReportableSchema', () => {
        it('accepts reportable boolean', () => {
            expect(MarkReportableSchema.safeParse({ reportable: true }).success).toBe(true);
        });

        it('requires reportable', () => {
            expect(MarkReportableSchema.safeParse({ note: 'n' }).success).toBe(false);
        });

        it('rejects a non-boolean reportable', () => {
            expect(MarkReportableSchema.safeParse({ reportable: 'yes' }).success).toBe(false);
        });
    });

    describe('SubmitNotificationSchema', () => {
        it('accepts valid input', () => {
            const r = SubmitNotificationSchema.safeParse({
                kind: 'EARLY_WARNING_24H',
                reportText: 'text',
                submissionRef: 'ref-1',
            });
            expect(r.success).toBe(true);
        });

        it('accepts null submissionRef', () => {
            expect(
                SubmitNotificationSchema.safeParse({
                    kind: 'FINAL_1MONTH',
                    reportText: 'text',
                    submissionRef: null,
                }).success,
            ).toBe(true);
        });

        it('rejects an invalid kind', () => {
            expect(
                SubmitNotificationSchema.safeParse({ kind: 'X', reportText: 't' }).success,
            ).toBe(false);
        });

        it('rejects empty reportText', () => {
            expect(
                SubmitNotificationSchema.safeParse({
                    kind: 'DETAILED_72H',
                    reportText: '',
                }).success,
            ).toBe(false);
        });

        it('rejects reportText over 50000 chars', () => {
            expect(
                SubmitNotificationSchema.safeParse({
                    kind: 'DETAILED_72H',
                    reportText: 'a'.repeat(50001),
                }).success,
            ).toBe(false);
        });
    });

    describe('AddTimelineEntrySchema', () => {
        it('accepts a valid entry', () => {
            expect(AddTimelineEntrySchema.safeParse({ entry: 'hello' }).success).toBe(true);
        });

        it('rejects an empty entry', () => {
            expect(AddTimelineEntrySchema.safeParse({ entry: '' }).success).toBe(false);
        });

        it('rejects an entry over 5000 chars', () => {
            expect(
                AddTimelineEntrySchema.safeParse({ entry: 'a'.repeat(5001) }).success,
            ).toBe(false);
        });
    });

    describe('LinkControlsSchema', () => {
        it('accepts an array of control ids', () => {
            expect(LinkControlsSchema.safeParse({ controlIds: ['a', 'b'] }).success).toBe(true);
        });

        it('accepts an empty array', () => {
            expect(LinkControlsSchema.safeParse({ controlIds: [] }).success).toBe(true);
        });

        it('rejects more than 200 ids', () => {
            expect(
                LinkControlsSchema.safeParse({
                    controlIds: Array.from({ length: 201 }, (_, i) => `c${i}`),
                }).success,
            ).toBe(false);
        });
    });

    describe('ToggleContainmentStepSchema', () => {
        it('accepts a valid step', () => {
            expect(
                ToggleContainmentStepSchema.safeParse({
                    stepKey: 'RANSOMWARE-1',
                    completed: true,
                }).success,
            ).toBe(true);
        });

        it('rejects an empty stepKey', () => {
            expect(
                ToggleContainmentStepSchema.safeParse({ stepKey: '', completed: true }).success,
            ).toBe(false);
        });

        it('rejects a stepKey over 64 chars', () => {
            expect(
                ToggleContainmentStepSchema.safeParse({
                    stepKey: 'a'.repeat(65),
                    completed: true,
                }).success,
            ).toBe(false);
        });

        it('requires completed boolean', () => {
            expect(
                ToggleContainmentStepSchema.safeParse({ stepKey: 'x' }).success,
            ).toBe(false);
        });
    });

    describe('LinkEvidenceSchema', () => {
        it('accepts a valid evidenceId', () => {
            expect(LinkEvidenceSchema.safeParse({ evidenceId: 'e1' }).success).toBe(true);
        });

        it('accepts a forensicCategory string and null', () => {
            expect(
                LinkEvidenceSchema.safeParse({ evidenceId: 'e1', forensicCategory: 'logs' })
                    .success,
            ).toBe(true);
            expect(
                LinkEvidenceSchema.safeParse({ evidenceId: 'e1', forensicCategory: null }).success,
            ).toBe(true);
        });

        it('rejects an empty evidenceId', () => {
            expect(LinkEvidenceSchema.safeParse({ evidenceId: '' }).success).toBe(false);
        });

        it('rejects a forensicCategory over 64 chars', () => {
            expect(
                LinkEvidenceSchema.safeParse({
                    evidenceId: 'e1',
                    forensicCategory: 'a'.repeat(65),
                }).success,
            ).toBe(false);
        });
    });
});
