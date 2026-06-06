/**
 * useEditAssetForm unwraps the PATCH `{ success, asset }` envelope so the
 * asset detail page's optimistic `setAsset(updated)` receives the bare
 * asset (same shape GET returns) — otherwise the Overview reads undefined
 * fields (criticality C/I/A) and looks unchanged until a manual refresh.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/tenant-context-provider', () => ({
    useTenantApiUrl: () => (p: string) => `/api/t/acme${p}`,
}));

import { useEditAssetForm } from '@/app/t/[tenantSlug]/(app)/assets/_form/useEditAssetForm';

const ASSET = { id: 'a1', name: 'Box', confidentiality: 1, integrity: 2, availability: 1, status: 'ACTIVE' };

describe('useEditAssetForm — PATCH envelope unwrap', () => {
    afterEach(() => jest.restoreAllMocks());

    it('passes the bare asset (not the {success, asset} wrapper) to onSuccess', async () => {
        const onSuccess = jest.fn();
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true, asset: ASSET }),
            }),
        ) as unknown as typeof fetch;

        const { result } = renderHook(() =>
            useEditAssetForm({ assetId: 'a1', initial: { name: 'Box' }, onSuccess }),
        );
        await act(async () => {
            await result.current.submit();
        });

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(ASSET);
        // The Overview reads these directly — they must survive the save.
        expect(onSuccess.mock.calls[0][0].confidentiality).toBe(1);
    });

    it('falls back to the bare payload when the response is already unwrapped', async () => {
        const onSuccess = jest.fn();
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ASSET) }),
        ) as unknown as typeof fetch;

        const { result } = renderHook(() =>
            useEditAssetForm({ assetId: 'a1', initial: { name: 'Box' }, onSuccess }),
        );
        await act(async () => {
            await result.current.submit();
        });

        expect(onSuccess).toHaveBeenCalledWith(ASSET);
    });
});
