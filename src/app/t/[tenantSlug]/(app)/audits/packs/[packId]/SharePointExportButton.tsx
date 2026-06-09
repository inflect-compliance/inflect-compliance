'use client';

/**
 * SP-5 — "Export to SharePoint" for a frozen audit pack. Picks a connection +
 * drive and uploads the pack ZIP to the library; shows the resulting link.
 */
import { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

interface Opt { value: string; label: string }

export function SharePointExportButton({ packId }: { packId: string }) {
    const apiUrl = useTenantApiUrl();
    const [available, setAvailable] = useState<boolean | null>(null);
    const [open, setOpen] = useState(false);
    const [connId, setConnId] = useState('');
    const [drives, setDrives] = useState<Opt[]>([]);
    const [driveId, setDriveId] = useState('');
    const [busy, setBusy] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Discover whether SharePoint is connected (controls button visibility).
    const probe = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/integrations/sharepoint/connections'));
            if (!res.ok) { setAvailable(false); return; }
            const conns = (await res.json()) as Array<{ id: string }>;
            setAvailable(conns.length > 0);
            setConnId(conns[0]?.id ?? '');
        } catch {
            setAvailable(false);
        }
    }, [apiUrl]);

    // Lazy probe on first render.
    if (available === null) void probe();
    if (available === false) return null;

    const openModal = async () => {
        setOpen(true);
        setError(null);
        setResultUrl(null);
        if (!connId) return;
        try {
            const res = await fetch(apiUrl(`/integrations/sharepoint/sites?connectionId=${connId}`));
            if (res.ok) {
                const data = await res.json();
                const opts: Opt[] = [];
                for (const ds of Object.values(data.drives) as { id: string; name: string }[][]) {
                    for (const d of ds) opts.push({ value: d.id, label: d.name });
                }
                setDrives(opts);
                setDriveId(opts[0]?.value ?? '');
            }
        } catch {
            setError('Could not load SharePoint libraries.');
        }
    };

    const doExport = async () => {
        if (!driveId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/audits/packs/${packId}/sharepoint-export`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: connId, driveId }),
            });
            if (!res.ok) { setError('Export failed.'); return; }
            const data = await res.json();
            setResultUrl(data.webUrl || null);
        } catch {
            setError('Export failed — network error.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button variant="secondary" size="sm" onClick={openModal} id="sp-export-pack-btn">
                Export to SharePoint
            </Button>
            <Modal showModal={open} setShowModal={setOpen} size="md" title="Export to SharePoint">
                <Modal.Header title="Export to SharePoint" description="Upload this frozen pack to a SharePoint library." />
                <Modal.Body className="space-y-default">
                    {error && <InlineNotice variant="error">{error}</InlineNotice>}
                    {resultUrl ? (
                        <InlineNotice variant="success">
                            Exported.{' '}
                            <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-content-link">
                                View in SharePoint ↗
                            </a>
                        </InlineNotice>
                    ) : (
                        <Combobox
                            id="sp-export-drive"
                            options={drives}
                            selected={drives.find((o) => o.value === driveId) ?? null}
                            setSelected={(o) => setDriveId(o?.value ?? '')}
                            placeholder="Choose a library"
                            matchTriggerWidth
                        />
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
                    {!resultUrl && (
                        <Button variant="primary" onClick={doExport} disabled={busy || !driveId}>
                            {busy ? 'Exporting…' : 'Export'}
                        </Button>
                    )}
                </Modal.Footer>
            </Modal>
        </>
    );
}
