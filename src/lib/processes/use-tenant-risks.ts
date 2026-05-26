"use client";

/**
 * Epic P2-PR-B — `useTenantRisks(tenantSlug)`.
 *
 * Sibling of `useTenantControls` (P2-PR-A) for the inspector's
 * risk-node picker. Same shape, different endpoint + option label
 * (Risks carry `title` only — no `ref`).
 *
 * Why a sibling module + not a generalised hook:
 *   The three pickers (controls, risks, assets) each hit a slightly
 *   different response shape and surface different label fields.
 *   Three short modules read more clearly than one parameterised
 *   abstraction at this scale; if we add a fourth picker we should
 *   reach for a `useTenantList<T>(...)` generic.
 */
import { useEffect, useState } from "react";

export interface TenantRiskOption {
    id: string;
    title: string;
    /**
     * PR-D polish — live status surface (parity with
     * TenantControlOption). The API ships `Risk.status` on each
     * row; we carry it through so the inspector can render a
     * tone-coloured chip alongside the option label.
     */
    status: string | null;
}

interface TenantRisksState {
    options: TenantRiskOption[];
    loading: boolean;
    error: string | null;
}

interface UseTenantRisksOptions {
    /**
     * PR-D polish — periodic revalidation cadence in milliseconds.
     * Omit (or pass 0) for the original "fetch once, cache forever"
     * behaviour. See `use-tenant-controls` for the full contract.
     */
    pollMs?: number;
}

const CACHE = new Map<string, TenantRiskOption[]>();

async function fetchTenantRisks(
    tenantSlug: string,
): Promise<TenantRiskOption[]> {
    const res = await fetch(`/api/t/${tenantSlug}/risks`);
    if (!res.ok) {
        throw new Error(`Could not load risks (${res.status})`);
    }
    const body = (await res.json()) as unknown;
    // Normalise both bare-array AND `{ risks: [...] }` / `{ data:
    // [...] }` wrapper responses — the API shape varies between
    // paginated + non-paginated.
    const rows = Array.isArray(body)
        ? (body as unknown[])
        : Array.isArray((body as { risks?: unknown[] })?.risks)
          ? (body as { risks: unknown[] }).risks
          : Array.isArray((body as { data?: unknown[] })?.data)
            ? (body as { data: unknown[] }).data
            : [];
    return rows
        .map((r) => {
            const row = r as {
                id?: unknown;
                title?: unknown;
                status?: unknown;
            };
            if (typeof row.id !== "string") return null;
            return {
                id: row.id,
                title:
                    typeof row.title === "string"
                        ? row.title
                        : "(untitled)",
                status: typeof row.status === "string" ? row.status : null,
            };
        })
        .filter((r): r is TenantRiskOption => r !== null);
}

export function useTenantRisks(
    tenantSlug: string,
    options?: UseTenantRisksOptions,
): TenantRisksState {
    const cached = CACHE.get(tenantSlug);
    const [state, setState] = useState<TenantRisksState>(() => ({
        options: cached ?? [],
        loading: cached === undefined && tenantSlug !== "",
        error: null,
    }));
    const pollMs = options?.pollMs ?? 0;

    useEffect(() => {
        if (tenantSlug === "") {
            setState({ options: [], loading: false, error: null });
            return;
        }
        let cancelled = false;
        const initialCached = CACHE.has(tenantSlug);
        if (initialCached) {
            setState({
                options: CACHE.get(tenantSlug) ?? [],
                loading: false,
                error: null,
            });
        } else {
            setState({ options: [], loading: true, error: null });
        }
        const runFetch = async (isRevalidation: boolean) => {
            try {
                const opts = await fetchTenantRisks(tenantSlug);
                CACHE.set(tenantSlug, opts);
                if (!cancelled) {
                    setState({ options: opts, loading: false, error: null });
                }
            } catch (err) {
                if (cancelled) return;
                if (isRevalidation) return;
                setState({
                    options: [],
                    loading: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Could not load risks",
                });
            }
        };
        if (!initialCached) {
            void runFetch(false);
        }
        let timer: ReturnType<typeof setInterval> | null = null;
        if (pollMs > 0) {
            timer = setInterval(() => {
                void runFetch(true);
            }, pollMs);
        }
        return () => {
            cancelled = true;
            if (timer !== null) clearInterval(timer);
        };
    }, [tenantSlug, pollMs]);

    return state;
}

/**
 * PR-D polish — locate one risk by id (parity with
 * `findTenantControl`).
 */
export function findTenantRisk(
    state: TenantRisksState,
    id: string | null,
): TenantRiskOption | null {
    if (!id) return null;
    return state.options.find((o) => o.id === id) ?? null;
}

export function __resetTenantRisksCacheForTests(): void {
    CACHE.clear();
}
