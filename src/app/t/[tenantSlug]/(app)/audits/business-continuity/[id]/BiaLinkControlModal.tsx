'use client';

/**
 * Attach this BIA to a control as evidence (kind BIA) — the continuity
 * link that establishes real framework coverage. Reuses the existing
 * `/business-continuity/:id/link-control` endpoint.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';

interface ControlOption {
    id: string;
    code?: string | null;
    name: string;
}

export function BiaLinkControlModal({
    tenantSlug,
    biaId,
    linkedControlIds,
    onClose,
    onLinked,
}: {
    tenantSlug: string;
    biaId: string;
    linkedControlIds: string[];
    onClose: () => void;
    onLinked: () => void | Promise<void>;
}) {
    const tx = useTranslations('audits');
    const [controls, setControls] = useState<ControlOption[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        fetch(`/api/t/${tenantSlug}/controls`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
            .then((d: unknown) => {
                const rows = Array.isArray(d)
                    ? (d as ControlOption[])
                    : ((d as { controls?: ControlOption[] })?.controls ?? []);
                if (active) setControls(rows);
            })
            .catch(() => {
                if (active) setError(tx('biaDetail.linkControlFailed'));
            });
        return () => {
            active = false;
        };
    }, [tenantSlug, tx]);

    const options = useMemo(
        () =>
            controls
                .filter((c) => !linkedControlIds.includes(c.id))
                .map((c) => ({ value: c.id, label: c.code ? `${c.code} · ${c.name}` : c.name })),
        [controls, linkedControlIds],
    );

    const onSubmit = async () => {
        if (!selectedId) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/business-continuity/${biaId}/link-control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ controlId: selectedId }),
            });
            if (!res.ok) throw new Error(tx('biaDetail.linkControlFailed'));
            await onLinked();
        } catch (e) {
            setError(e instanceof Error ? e.message : tx('biaDetail.linkControlFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            showModal
            setShowModal={(v) => {
                if (!v && !submitting) onClose();
            }}
            size="md"
            title={tx('biaDetail.linkControlTitle')}
            description={tx('biaDetail.linkControlDesc')}
            preventDefaultClose={submitting}
        >
            <Modal.Header title={tx('biaDetail.linkControlTitle')} description={tx('biaDetail.linkControlDesc')} />
            <Modal.Body>
                {error && (
                    <div className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                        {error}
                    </div>
                )}
                <FormField label={tx('biaDetail.linkControlSelect')}>
                    <Combobox
                        id="bia-link-control"
                        name="bia-link-control"
                        options={options}
                        selected={options.find((o) => o.value === selectedId) ?? null}
                        setSelected={(o) => setSelectedId(o?.value ?? null)}
                        placeholder={tx('biaDetail.linkControlPlaceholder')}
                        matchTriggerWidth
                        forceDropdown
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
            </Modal.Body>
            <Modal.Footer>
                <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                    {tx('biaDetail.linkControlCancel')}
                </Button>
                <Button type="button" variant="primary" onClick={onSubmit} disabled={submitting || !selectedId}>
                    {tx('biaDetail.linkControlConfirm')}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
