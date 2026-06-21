'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- self-contained
 * panel consuming server-rendered evidence rows. */

/**
 * Attached-evidence panel — the writable, Control-style evidence
 * surface for a Risk or Asset detail page. Upload files via the shared
 * drag-and-drop `<EvidenceUploadSection>` (scoped to the entity through
 * `Evidence.riskId` / `Evidence.assetId`), rendered through the shared
 * `<EvidenceSubTable>`.
 *
 * This is DISTINCT from `<InheritedEvidencePanel>` (read-only evidence
 * aggregated from the entity's mapped controls). The Risk/Asset Evidence
 * tab stacks both: this panel for attached evidence, the inherited panel
 * below it.
 */
import { useCallback, useEffect, useState } from 'react';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { useToastWithUndo } from '@/components/ui/hooks';
import { EvidenceUploadSection } from '@/components/evidence/EvidenceUploadSection';
import {
    EvidenceSubTable,
    type EvidenceTabData,
} from '@/app/t/[tenantSlug]/(app)/controls/[controlId]/_tabs/EvidenceSubTable';

interface AttachedEvidencePanelProps {
    /** Tenant slug — drives the evidence-upload endpoint. */
    tenantSlug: string;
    /** Risk or asset id. */
    entityId: string;
    /** Drives the upload field name + element ids + copy. */
    entity: 'risk' | 'asset';
    /**
     * Attached-evidence endpoint WITHOUT the `/api/t/<slug>` prefix —
     * e.g. `/risks/<id>/evidence/attached`. GET returns
     * `{ links, evidence }`; DELETE `${endpoint}/<id>` detaches.
     */
    endpoint: string;
    apiUrl: (path: string) => string;
    tenantHref: (path: string) => string;
    canWrite: boolean;
}

export function AttachedEvidencePanel({
    tenantSlug,
    entityId,
    entity,
    endpoint,
    apiUrl,
    tenantHref,
    canWrite,
}: AttachedEvidencePanelProps) {
    const triggerUndoToast = useToastWithUndo();
    const [data, setData] = useState<EvidenceTabData | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const refetch = useCallback(async () => {
        try {
            const res = await fetch(apiUrl(endpoint));
            if (!res.ok) throw new Error('load failed');
            setData(await res.json());
            setError(false);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, endpoint]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState lands async inside refetch (mirrors InheritedEvidencePanel).
        void refetch();
    }, [refetch]);

    // Epic 67 — delayed-commit removal (detach the FK). Optimistic
    // filter, undo restores, commit-failure rolls back.
    const removeEvidence = (evidenceId: string) => {
        const previous = data;
        setData((prev) =>
            prev
                ? { ...prev, evidence: (prev.evidence ?? []).filter((ev: any) => ev.id !== evidenceId) }
                : prev,
        );
        triggerUndoToast({
            message: 'Evidence removed',
            undoMessage: 'Undo',
            action: async () => {
                const res = await fetch(apiUrl(`${endpoint}/${evidenceId}`), {
                    method: 'DELETE',
                });
                if (!res.ok) throw new Error('Remove evidence failed');
                await refetch();
            },
            undoAction: () => setData(previous),
            onError: () => setData(previous),
        });
    };

    return (
        <div className="space-y-default" data-testid={`${entity}-attached-evidence`}>
            <EvidenceUploadSection
                tenantSlug={tenantSlug}
                linkField={entity === 'risk' ? 'riskId' : 'assetId'}
                linkId={entityId}
                canWrite={canWrite}
                onUploaded={refetch}
                urlLinkEndpoint={endpoint}
            />
            {error ? (
                <InlineEmptyState
                    title="Couldn't load evidence"
                    description="Something went wrong fetching attached evidence. Reload the page to try again."
                />
            ) : (
                <EvidenceSubTable
                    data={data}
                    loading={loading && !data}
                    canWrite={canWrite}
                    onUnlink={() => {}}
                    onUnlinkEvidence={removeEvidence}
                    tenantHref={tenantHref}
                />
            )}
        </div>
    );
}
