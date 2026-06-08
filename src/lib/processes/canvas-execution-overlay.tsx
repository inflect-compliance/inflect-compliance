'use client';

/**
 * Live execution overlay (Visual Rule Editor VR-6).
 *
 * Polls the live-executions endpoint (Roadmap-A Epic 10) every 3s and exposes
 * a `ruleId → ExecutionOverlayState` map the canvas paints onto automation
 * nodes/edges in Run Mode.
 *
 * Distribution is via context, NOT a per-node hook: the canvas computes the
 * map once (one SWR subscription) and provides it; each `ProcessTypedNode`
 * reads its own ruleId through `useNodeOverlayStatus`. This keeps the node
 * renderer free of tenant-context / network dependencies (so it still renders
 * in isolation in tests + SSR) — the overlay is simply empty without a provider.
 */
import {
    createContext,
    useContext,
    type ReactNode,
} from 'react';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';

export type OverlayStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface ExecutionOverlayState {
    status: OverlayStatus;
    startedAt: string;
    /** simultaneous executions of this rule (running) */
    count: number;
}

interface LiveExecutionItem {
    ruleId: string;
    status: string;
    createdAt: string;
}
interface LiveExecutionsResponse {
    running: LiveExecutionItem[];
    recent: LiveExecutionItem[];
}

/**
 * Pure reducer (unit-tested): RUNNING wins over a terminal state for the same
 * rule; running rows accumulate a `count`. Recent terminal rows fill in
 * status for rules not currently running so a just-finished node still flashes.
 */
export function buildOverlayMap(
    resp: LiveExecutionsResponse | undefined,
): Map<string, ExecutionOverlayState> {
    const map = new Map<string, ExecutionOverlayState>();
    if (!resp) return map;
    for (const r of resp.recent ?? []) {
        if (!map.has(r.ruleId)) {
            map.set(r.ruleId, {
                status: (r.status as OverlayStatus) ?? 'SKIPPED',
                startedAt: r.createdAt,
                count: 0,
            });
        }
    }
    for (const r of resp.running ?? []) {
        const existing = map.get(r.ruleId);
        map.set(r.ruleId, {
            status: 'RUNNING',
            startedAt: r.createdAt,
            count: (existing?.status === 'RUNNING' ? existing.count : 0) + 1,
        });
    }
    return map;
}

/**
 * Visual treatment for an overlay status — the class the node renderer applies
 * to its chassis in Run Mode. Pure, so it's unit-tested without the canvas.
 */
export function overlayClassFor(status: OverlayStatus | undefined): string {
    switch (status) {
        case 'RUNNING':
            return 'ring-2 ring-brand-default animate-pulse';
        case 'SUCCEEDED':
            return 'ring-2 ring-content-success';
        case 'FAILED':
            return 'ring-2 ring-content-error';
        case 'SKIPPED':
            return 'opacity-50';
        default:
            return '';
    }
}

const OverlayContext = createContext<Map<string, ExecutionOverlayState>>(new Map());

/**
 * Canvas-level provider — calls the live SWR poll once (only while `enabled`)
 * and distributes the map to every node via context.
 */
export function CanvasOverlayProvider({
    enabled,
    children,
}: {
    enabled: boolean;
    children: ReactNode;
}) {
    const { data } = useTenantSWR<LiveExecutionsResponse>(
        enabled ? CACHE_KEYS.automation.executions.live() : null,
        { refreshInterval: enabled ? 3000 : 0 },
    );
    return (
        <OverlayContext.Provider value={buildOverlayMap(data)}>
            {children}
        </OverlayContext.Provider>
    );
}

/** Node-side read — safe without a provider (empty map → no overlay). */
export function useNodeOverlayStatus(ruleId: string | undefined): OverlayStatus | undefined {
    const map = useContext(OverlayContext);
    return ruleId ? map.get(ruleId)?.status : undefined;
}
