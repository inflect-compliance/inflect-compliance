/**
 * Switch a process map between DOCUMENT and AUTOMATION canvas mode.
 *
 * A metadata-only PATCH (no graph save) so a user can convert an existing
 * process map into the visual rule editor (or back) from the document bar.
 */
export type CanvasMode = 'DOCUMENT' | 'AUTOMATION';

export async function patchCanvasMode(
    tenantSlug: string,
    mapId: string,
    canvasMode: CanvasMode,
): Promise<void> {
    const res = await fetch(`/api/t/${tenantSlug}/processes/${mapId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasMode }),
    });
    if (!res.ok) throw new Error(`Mode switch failed (${res.status})`);
}
