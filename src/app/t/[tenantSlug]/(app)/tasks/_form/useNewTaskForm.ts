'use client';

/**
 * Task-create form hook — modal-form P1 extraction.
 *
 * Owns:
 *   - the main form state (title, type, severity, priority, etc.)
 *   - the pending-links staging buffer (additional `entityType / entityId`
 *     pairs that submit creates via secondary POSTs after the task is
 *     minted)
 *   - the audit-specific metadata (findingSource, controlGapType) for
 *     `AUDIT_FINDING` / `CONTROL_GAP` task types
 *   - validation: certain types require a control or link to be present
 *   - telemetry + submit + error
 *
 * The companion `<NewTaskFields>` component reads from this hook and
 * renders the controlled markup; both the legacy `/tasks/new` page
 * and the P2 `<NewTaskModal>` will compose them identically. See
 * `docs/implementation-notes/2026-05-24-modal-form-architecture.md`.
 */
import { useState } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useFormTelemetry } from '@/lib/telemetry/form-telemetry';

export type TaskType =
    | 'TASK'
    | 'AUDIT_FINDING'
    | 'CONTROL_GAP'
    | 'INCIDENT'
    | 'IMPROVEMENT';

export interface PendingLink {
    entityType: string;
    entityId: string;
}

export interface NewTaskFormFields {
    title: string;
    description: string;
    type: TaskType;
    severity: string;
    priority: string;
    dueAt: string;
    assigneeUserId: string;
    controlId: string;
    findingSource: string;
    controlGapType: string;
}

export interface NewTaskFormReturn {
    fields: NewTaskFormFields;
    setField: <K extends keyof NewTaskFormFields>(
        key: K,
        value: NewTaskFormFields[K],
    ) => void;
    pendingLinks: PendingLink[];
    linkEntityType: string;
    setLinkEntityType: (entityType: string) => void;
    linkEntityId: string;
    setLinkEntityId: (entityId: string) => void;
    addPendingLink: () => void;
    removePendingLink: (index: number) => void;
    submitting: boolean;
    error: string | null;
    canSubmit: boolean;
    /**
     * The synchronous-validation message — empty if the form is OK to
     * submit. Surfaced in the link-section warning chip.
     */
    validationMessage: string;
    submit: () => Promise<void>;
}

export interface UseNewTaskFormOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (task: any) => void;
}

export function useNewTaskForm({
    onSuccess,
}: UseNewTaskFormOptions): NewTaskFormReturn {
    const apiUrl = useTenantApiUrl();
    const telemetry = useFormTelemetry('NewTaskPage');

    const [fields, setFields] = useState<NewTaskFormFields>({
        title: '',
        description: '',
        type: 'TASK',
        severity: 'MEDIUM',
        priority: 'P2',
        dueAt: '',
        assigneeUserId: '',
        controlId: '',
        findingSource: '',
        controlGapType: '',
    });
    const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
    const [linkEntityType, setLinkEntityType] = useState('CONTROL');
    const [linkEntityId, setLinkEntityId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setField = <K extends keyof NewTaskFormFields>(
        key: K,
        value: NewTaskFormFields[K],
    ) => {
        setFields((f) => ({ ...f, [key]: value }));
    };

    const addPendingLink = () => {
        if (!linkEntityId.trim()) return;
        setPendingLinks((prev) => [
            ...prev,
            { entityType: linkEntityType, entityId: linkEntityId.trim() },
        ]);
        setLinkEntityId('');
    };
    const removePendingLink = (idx: number) => {
        setPendingLinks((prev) => prev.filter((_, i) => i !== idx));
    };

    // Validation: certain types require a control or link.
    const needsControlOrLink = ['AUDIT_FINDING', 'CONTROL_GAP'].includes(
        fields.type,
    );
    const needsAssetOrControl = fields.type === 'INCIDENT';
    const hasControlOrLink =
        !!fields.controlId ||
        pendingLinks.some((l) =>
            ['CONTROL', 'FRAMEWORK_REQUIREMENT'].includes(l.entityType),
        );
    const hasAssetOrControl =
        !!fields.controlId ||
        pendingLinks.some((l) => ['CONTROL', 'ASSET'].includes(l.entityType));

    const validationMessage = (() => {
        if (needsControlOrLink && !hasControlOrLink) {
            return 'Audit Finding / Control Gap requires a control or framework requirement link.';
        }
        if (needsAssetOrControl && !hasAssetOrControl) {
            return 'Incident requires an asset or control link.';
        }
        return '';
    })();

    const canSubmit =
        fields.title.trim().length > 0 && !submitting && !validationMessage;

    const submit = async (): Promise<void> => {
        if (validationMessage) {
            setError(validationMessage);
            return;
        }
        if (!fields.title.trim()) return;
        setSubmitting(true);
        setError(null);
        telemetry.trackSubmit({
            type: fields.type,
            severity: fields.severity,
            priority: fields.priority,
            pendingLinkCount: pendingLinks.length,
            hasAssignee: Boolean(fields.assigneeUserId),
        });
        try {
            const metadataJson: Record<string, string> = {};
            if (fields.findingSource)
                metadataJson.findingSource = fields.findingSource;
            if (fields.controlGapType)
                metadataJson.controlGapType = fields.controlGapType;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = {
                title: fields.title,
                type: fields.type,
                severity: fields.severity,
                priority: fields.priority,
                description: fields.description || undefined,
                dueAt: fields.dueAt || undefined,
                assigneeUserId: fields.assigneeUserId || undefined,
                controlId: fields.controlId || undefined,
                metadataJson:
                    Object.keys(metadataJson).length > 0
                        ? metadataJson
                        : undefined,
            };
            const res = await fetch(apiUrl('/tasks'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg =
                    typeof data.error === 'string'
                        ? data.error
                        : data.message || 'Failed to create task';
                throw new Error(msg);
            }
            const task = await res.json();

            // Best-effort secondary POSTs for the staged links.
            for (const link of pendingLinks) {
                await fetch(apiUrl(`/tasks/${task.id}/links`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entityType: link.entityType,
                        entityId: link.entityId,
                        relation: 'RELATES_TO',
                    }),
                }).catch(() => {
                    /* swallow — link is best-effort */
                });
            }

            telemetry.trackSuccess({ taskId: task.id });
            onSuccess(task);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            telemetry.trackError(e);
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    return {
        fields,
        setField,
        pendingLinks,
        linkEntityType,
        setLinkEntityType,
        linkEntityId,
        setLinkEntityId,
        addPendingLink,
        removePendingLink,
        submitting,
        error,
        canSubmit,
        validationMessage,
        submit,
    };
}
