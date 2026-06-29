/**
 * @jest-environment jsdom
 */
/**
 * Behavioural coverage for the six thin domain data-fetching hook
 * modules built on `use-api.ts`:
 *   - src/lib/hooks/use-controls.ts
 *   - src/lib/hooks/use-risks.ts
 *   - src/lib/hooks/use-policies.ts
 *   - src/lib/hooks/use-assets.ts
 *   - src/lib/hooks/use-tasks.ts
 *   - src/lib/hooks/use-evidence.ts
 *
 * All six were genuinely 0% (not loaded by any test). Each exported
 * hook is exercised at least once:
 *   - list / detail / dashboard hooks → mount, fetch, assert ready.
 *   - the `id ? url : null` detail ternary → null branch (skip fetch).
 *   - create / update / delete mutation hooks → call mutate, await.
 *
 * The hooks read tenant context via `useTenantApiUrl()` and funnel
 * every request through `apiGet/apiPost/apiPatch/apiDelete`, all of
 * which use `fetch`. So a single `globalThis.fetch` stub + a real
 * `TenantProvider` wrapper covers the whole graph — no module mocks
 * needed. The wrapper is built with `React.createElement` so the file
 * stays a `.ts` (node project; jsdom via the docblock).
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TenantProvider } from '@/lib/tenant-context-provider';
import type { TenantContextValue } from '@/lib/tenant-context-provider';
import { getPermissionsForRole } from '@/lib/permissions';

import {
    useControls,
    useControl,
    useControlDashboard,
    useCreateControl,
    useUpdateControl,
    useDeleteControl,
} from '@/lib/hooks/use-controls';
import {
    useRisks,
    useRisk,
    useCreateRisk,
    useUpdateRisk,
    useDeleteRisk,
} from '@/lib/hooks/use-risks';
import {
    usePolicies,
    usePolicy,
    useCreatePolicy,
    useUpdatePolicy,
    useDeletePolicy,
} from '@/lib/hooks/use-policies';
import {
    useAssets,
    useAsset,
    useCreateAsset,
    useUpdateAsset,
    useDeleteAsset,
} from '@/lib/hooks/use-assets';
import {
    useTasks,
    useTask,
    useCreateTask,
    useUpdateTask,
    useDeleteTask,
} from '@/lib/hooks/use-tasks';
import {
    useEvidence,
    useEvidenceItem,
    useCreateEvidence,
    useDeleteEvidence,
} from '@/lib/hooks/use-evidence';

// ─── Wrapper + fetch stub ────────────────────────────────────────────

const TENANT_CTX: TenantContextValue = {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    role: 'OWNER',
    permissions: {
        canRead: true,
        canWrite: true,
        canAdmin: true,
        canAudit: true,
        canExport: true,
    },
    appPermissions: getPermissionsForRole('OWNER'),
};

function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(TenantProvider, { value: TENANT_CTX }, children);
}

const COLLECTIONS = ['controls', 'risks', 'policies', 'assets', 'tasks', 'evidence'];

const originalFetch = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: unknown, init?: { method?: string }) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        let payload: unknown = {};
        if (method === 'GET') {
            // A bare collection endpoint (…/acme/controls) returns an
            // array; detail (…/controls/<id>) and dashboard return an
            // object. The Zod validation in `apiGet` only warns on
            // mismatch (never throws), so a minimal shape is enough to
            // drive the success path.
            const seg = url.match(/\/api\/t\/[^/]+\/([^/?]+)$/)?.[1];
            payload = seg && COLLECTIONS.includes(seg) ? [] : {};
        }
        return {
            ok: true,
            status: 200,
            json: async () => payload,
        };
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
});

// ─── Read hooks (list / detail / dashboard) ──────────────────────────

describe('domain read hooks resolve to data with loading=false', () => {
    it.each([
        ['useControls', () => useControls()],
        ['useControl', () => useControl('c1')],
        ['useControlDashboard', () => useControlDashboard()],
        ['useRisks', () => useRisks()],
        ['useRisk', () => useRisk('r1')],
        ['usePolicies', () => usePolicies()],
        ['usePolicy', () => usePolicy('p1')],
        ['useAssets', () => useAssets()],
        ['useAsset', () => useAsset('a1')],
        ['useTasks', () => useTasks()],
        ['useTask', () => useTask('t1')],
        ['useEvidence', () => useEvidence()],
        ['useEvidenceItem', () => useEvidenceItem('e1')],
    ])('%s', async (_name, hook) => {
        const { result } = renderHook(() => hook(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).not.toBeNull();
        expect(result.current.error).toBeNull();
        expect(globalThis.fetch).toHaveBeenCalled();
    });
});

describe('detail hooks skip fetching when id is null (false ternary branch)', () => {
    it.each([
        ['useControl', () => useControl(null)],
        ['useRisk', () => useRisk(null)],
        ['usePolicy', () => usePolicy(undefined)],
        ['useAsset', () => useAsset(null)],
        ['useTask', () => useTask(undefined)],
        ['useEvidenceItem', () => useEvidenceItem(null)],
    ])('%s', async (_name, hook) => {
        const { result } = renderHook(() => hook(), { wrapper });
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.loading).toBe(false);
        expect(result.current.data).toBeNull();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});

// ─── Mutation hooks (create / update / delete) ───────────────────────

describe('domain mutation hooks resolve through the api-client', () => {
    it.each([
        ['useCreateControl', () => useCreateControl(), {} as Record<string, unknown>],
        ['useUpdateControl', () => useUpdateControl('c1'), {} as Record<string, unknown>],
        ['useDeleteControl', () => useDeleteControl(), 'c1'],
        ['useCreateRisk', () => useCreateRisk(), {} as Record<string, unknown>],
        ['useUpdateRisk', () => useUpdateRisk('r1'), {} as Record<string, unknown>],
        ['useDeleteRisk', () => useDeleteRisk(), 'r1'],
        ['useCreatePolicy', () => useCreatePolicy(), {} as Record<string, unknown>],
        ['useUpdatePolicy', () => useUpdatePolicy('p1'), {} as Record<string, unknown>],
        ['useDeletePolicy', () => useDeletePolicy(), 'p1'],
        ['useCreateAsset', () => useCreateAsset(), {} as Record<string, unknown>],
        ['useUpdateAsset', () => useUpdateAsset('a1'), {} as Record<string, unknown>],
        ['useDeleteAsset', () => useDeleteAsset(), 'a1'],
        ['useCreateTask', () => useCreateTask(), {} as Record<string, unknown>],
        ['useUpdateTask', () => useUpdateTask('t1'), {} as Record<string, unknown>],
        ['useDeleteTask', () => useDeleteTask(), 't1'],
        ['useCreateEvidence', () => useCreateEvidence(), {} as Record<string, unknown>],
        ['useDeleteEvidence', () => useDeleteEvidence(), 'e1'],
    ])('%s', async (_name, hook, payload) => {
        const { result } = renderHook(() => hook(), { wrapper });
        expect(result.current.loading).toBe(false);

        await act(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (result.current.mutate as (p: any) => Promise<unknown>)(payload);
        });

        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(globalThis.fetch).toHaveBeenCalled();
    });
});
