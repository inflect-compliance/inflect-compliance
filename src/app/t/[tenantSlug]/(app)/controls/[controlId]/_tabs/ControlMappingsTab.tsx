'use client';

/**
 * Control detail — Mappings tab (#102 item 1, tab-lazy refactor).
 *
 * Extracted from the 1,500-line control detail page. Fully
 * self-contained: it owns the framework-mapping list
 * (`useTenantSWR` — fetched only because this component mounts only
 * when the Mappings tab is active), plus the framework / requirement
 * pickers for the "map a requirement" form and the map / unmap
 * mutations.
 *
 * `onMutated` lets the parent revalidate its page-data header so the
 * Mappings tab-badge count stays in sync after a map / unmap.
 */
import { useEffect, useState } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useToastWithUndo } from '@/components/ui/hooks';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { CopyText } from '@/components/ui/copy-text';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@dub/utils';
import type { FrameworkDTO, RequirementDTO, FrameworkMappingDTO } from '@/lib/dto';

interface ControlMappingsTabProps {
    controlId: string;
    canWrite: boolean;
    /** Revalidate the page-data header — keeps the tab-badge current. */
    onMutated: () => void;
}

export function ControlMappingsTab({
    controlId,
    canWrite,
    onMutated,
}: ControlMappingsTabProps) {
    const apiUrl = useTenantApiUrl();
    const triggerUndoToast = useToastWithUndo();

    const mappingsSWR = useTenantSWR<FrameworkMappingDTO[]>(
        CACHE_KEYS.controls.mappings(controlId),
    );

    const [showMapForm, setShowMapForm] = useState(false);
    const [frameworks, setFrameworks] = useState<FrameworkDTO[]>([]);
    const [selectedFramework, setSelectedFramework] = useState('');
    const [requirements, setRequirements] = useState<RequirementDTO[]>([]);
    const [selectedReq, setSelectedReq] = useState('');
    const [savingMap, setSavingMap] = useState(false);

    // Frameworks load once — the component mounts only when the
    // Mappings tab is active, so there's no tab gate to check.
    useEffect(() => {
        fetch(apiUrl('/controls/frameworks'))
            .then((r) => (r.ok ? r.json() : []))
            .then(setFrameworks)
            .catch(() => {});
    }, [apiUrl]);

    // Requirements reload whenever the selected framework changes.
    useEffect(() => {
        if (!selectedFramework) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRequirements([]);
            return;
        }
        fetch(apiUrl(`/controls/frameworks/${selectedFramework}/requirements`))
            .then((r) => (r.ok ? r.json() : []))
            .then(setRequirements)
            .catch(() => {});
    }, [selectedFramework, apiUrl]);

    const mapRequirement = async () => {
        if (!selectedReq) return;
        setSavingMap(true);
        await fetch(apiUrl(`/controls/${controlId}/requirements`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: selectedReq }),
        });
        setSelectedReq('');
        setShowMapForm(false);
        await mappingsSWR.mutate();
        onMutated();
        setSavingMap(false);
    };

    // Epic 67 — delayed-commit unmap against this tab's own SWR
    // cache. Optimistically drop the row; the DELETE fires after the
    // 5 s undo window.
    const unmapRequirement = (reqId: string) => {
        const previous = mappingsSWR.data;
        if (previous) {
            mappingsSWR.mutate(
                previous.filter(
                    (m) =>
                        m.fromRequirement?.id !== reqId &&
                        m.fromRequirementId !== reqId,
                ),
                { revalidate: false },
            );
        }
        triggerUndoToast({
            message: 'Requirement unmapped',
            undoMessage: 'Undo',
            action: async () => {
                const res = await fetch(
                    apiUrl(`/controls/${controlId}/requirements`),
                    {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requirementId: reqId }),
                    },
                );
                if (!res.ok) throw new Error('Unmap failed');
                await mappingsSWR.mutate();
                onMutated();
            },
            undoAction: () => {
                if (previous) {
                    mappingsSWR.mutate(previous, { revalidate: false });
                }
            },
            onError: () => {
                if (previous) {
                    mappingsSWR.mutate(previous, { revalidate: false });
                }
            },
        });
    };

    return (
        <div className="space-y-default">
            {canWrite && (
                <div className="flex justify-end">
                    <Button variant="primary" onClick={() => setShowMapForm(!showMapForm)} id="map-requirement-btn">
                        + Map Requirement
                    </Button>
                </div>
            )}
            {showMapForm && canWrite && (
                <div className={cn(cardVariants({ density: 'compact' }), 'space-y-compact')}>
                    <Combobox
                        id="framework-select"
                        selected={frameworks.map((f) => ({ value: f.key ?? f.id ?? '', label: f.name })).find((o) => o.value === selectedFramework) ?? null}
                        setSelected={(opt) => setSelectedFramework(opt?.value ?? '')}
                        options={frameworks.map((f) => ({ value: f.key ?? f.id ?? '', label: f.name }))}
                        placeholder="Select Framework..."
                        matchTriggerWidth
                    />
                    {requirements.length > 0 && (
                        <>
                            <Combobox
                                id="requirement-select"
                                selected={requirements.map((r) => ({ value: r.id, label: `${r.code ? `${r.code} — ` : ''}${r.title || r.description}` })).find((o) => o.value === selectedReq) ?? null}
                                setSelected={(opt) => setSelectedReq(opt?.value ?? '')}
                                options={requirements.map((r) => ({ value: r.id, label: `${r.code ? `${r.code} — ` : ''}${r.title || r.description}` }))}
                                placeholder="Select Requirement..."
                                matchTriggerWidth
                            />
                            <Button variant="primary" onClick={mapRequirement} disabled={!selectedReq || savingMap} id="submit-mapping-btn">
                                {savingMap ? 'Mapping...' : 'Map'}
                            </Button>
                        </>
                    )}
                </div>
            )}
            <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                {mappingsSWR.isLoading && !mappingsSWR.data ? (
                    <div className="p-6">
                        <SkeletonCard lines={3} />
                    </div>
                ) : mappingsSWR.error ? (
                    <InlineEmptyState
                        title="Couldn't load mappings"
                        description="Something went wrong fetching this control's framework mappings. Reload the page to try again."
                    />
                ) : (mappingsSWR.data?.length ?? 0) === 0 ? (
                    <InlineEmptyState
                        title="No framework mappings"
                        description="Map this control to specific framework requirements to track coverage."
                    />
                ) : (
                    <table className="data-table" id="mappings-table">
                        <thead>
                            <tr><th>Framework</th><th>Requirement</th>{canWrite && <th>Actions</th>}</tr>
                        </thead>
                        <tbody>
                            {mappingsSWR.data?.map((m) => (
                                <tr key={m.id}>
                                    <td className="text-sm text-content-emphasis">{m.fromRequirement?.framework?.name || '—'}</td>
                                    <td className="text-sm text-content-default">
                                        {m.fromRequirement?.code && (
                                            <CopyText
                                                value={m.fromRequirement.code}
                                                label={`Copy requirement code ${m.fromRequirement.code}`}
                                                successMessage="Requirement code copied"
                                                className="mr-2 text-content-subtle"
                                            >
                                                {m.fromRequirement.code}
                                            </CopyText>
                                        )}
                                        {m.fromRequirement?.title || m.fromRequirement?.description || '—'}
                                    </td>
                                    {canWrite && (
                                        <td>
                                            <button className="text-content-error text-xs hover:text-content-error" onClick={() => unmapRequirement(m.fromRequirement?.id || m.fromRequirementId || '')} id={`unmap-${m.id}`}>
                                                × Remove
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
