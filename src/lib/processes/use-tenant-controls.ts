"use client";

/**
 * Epic P2-PR-A — `useTenantControls(tenantSlug)`.
 *
 * Lazy-fetches the tenant's full Controls list so the
 * ProcessInspector's edge-mode "Linked control" Combobox has options
 * to render. The fetch fires on first mount inside a canvas page;
 * subsequent inspector mounts reuse the same in-memory cache for
 * the session (a tenant doesn't grow controls fast enough for a
 * fresh fetch per inspector open to feel responsive).
 *
 * Why a hook, not a context:
 *   The inspector is the only consumer today. Wrapping the whole
 *   Processes page in a ControlsProvider would couple the canvas's
 *   render tree to the controls fetch, which we don't want — the
 *   canvas should mount instantly + the controls dropdown can wait
 *   for the network. A hook keeps the dependency local to the
 *   component that actually needs it.
 *
 * Cache shape:
 *   Module-scoped Map keyed by tenant slug. Lives for the page
 *   session; a tenant switch (navigation) re-mounts the page and
 *   the map's old entry is harmless (different key).
 */
import { useEffect, useState } from "react";

export interface TenantControlOption {
    id: string;
    ref: string | null;
    title: string;
    /**
     * PR-D polish — live status surface. The API ships
     * `Control.status` on each row; we carry it through so
     * downstream consumers can render a tone-coloured chip next
     * to the option label. Null when the row is missing the
     * field (older snapshots, edge cases).
     */
    status: string | null;
}

interface TenantControlsState {
    options: TenantControlOption[];
    loading: boolean;
    error: string | null;
}

interface UseTenantControlsOptions {
    /**
     * PR-D polish — periodic revalidation cadence in milliseconds.
     * When set, the hook re-fetches the controls list on this
     * interval and updates the cache + state. Omit (or pass 0)
     * for the original "fetch once, cache forever" behaviour.
     *
     * Recommended cadence: 30000 (30s). Faster will hammer the
     * API; slower means stale linked-entity status badges on the
     * canvas.
     */
    pollMs?: number;
}

// Module-scoped cache. Survives component remounts within the same
// tenant session; cleared on tenant slug change (different key).
const CACHE = new Map<string, TenantControlOption[]>();

async function fetchTenantControls(
    tenantSlug: string,
): Promise<TenantControlOption[]> {
    const res = await fetch(`/api/t/${tenantSlug}/controls`);
    if (!res.ok) {
        throw new Error(`Could not load controls (${res.status})`);
    }
    const body = (await res.json()) as unknown;
    // The endpoint shape (`{ controls: [...] }` vs bare array)
    // varies between paginated + non-paginated paths. Normalise
    // both shapes here.
    const rows = Array.isArray(body)
        ? (body as unknown[])
        : Array.isArray((body as { controls?: unknown[] })?.controls)
          ? (body as { controls: unknown[] }).controls
          : [];
    return rows
        .map((r) => {
            const row = r as {
                id?: unknown;
                ref?: unknown;
                title?: unknown;
                status?: unknown;
            };
            if (typeof row.id !== "string") return null;
            return {
                id: row.id,
                ref: typeof row.ref === "string" ? row.ref : null,
                title:
                    typeof row.title === "string"
                        ? row.title
                        : "(no title)",
                status: typeof row.status === "string" ? row.status : null,
            };
        })
        .filter((r): r is TenantControlOption => r !== null);
}

export function useTenantControls(
    tenantSlug: string,
    options?: UseTenantControlsOptions,
): TenantControlsState {
    const cached = CACHE.get(tenantSlug);
    const [state, setState] = useState<TenantControlsState>(() => ({
        options: cached ?? [],
        loading: cached === undefined,
        error: null,
    }));
    const pollMs = options?.pollMs ?? 0;

    useEffect(() => {
        // Empty-string slug → no-op. Lets a rendered test or
        // storybook mount the inspector without standing up the
        // canvas's tenant context.
        if (tenantSlug === "") {
            setState({ options: [], loading: false, error: null });
            return;
        }
        let cancelled = false;
        const initialCached = CACHE.has(tenantSlug);
        if (initialCached) {
            // Hit cache: stable state, no immediate network.
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
                const opts = await fetchTenantControls(tenantSlug);
                CACHE.set(tenantSlug, opts);
                if (!cancelled) {
                    setState({
                        options: opts,
                        loading: false,
                        error: null,
                    });
                }
            } catch (err) {
                if (cancelled) return;
                // Background revalidations preserve the last-good
                // state — a transient blip shouldn't blank the
                // canvas's status badges. Only the initial fetch
                // surfaces the error to the consumer.
                if (isRevalidation) return;
                setState({
                    options: [],
                    loading: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Could not load controls",
                });
            }
        };
        if (!initialCached) {
            void runFetch(false);
        }
        // PR-D polish — periodic revalidation. The interval only
        // fires after the initial fetch settles (no need to stack
        // a poll on top of the cold-load network call).
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
 * Format a control as a Combobox option label: prefer
 * `<ref> · <title>` when ref is present, fall back to title alone.
 */
export function formatControlLabel(opt: TenantControlOption): string {
    return opt.ref ? `${opt.ref} · ${opt.title}` : opt.title;
}

/**
 * PR-D polish — locate one entity by id in the hook's state.
 * Used by the inspector to render the selected entity's live
 * status chip without re-deriving the lookup in every caller.
 */
export function findTenantControl(
    state: TenantControlsState,
    id: string | null,
): TenantControlOption | null {
    if (!id) return null;
    return state.options.find((o) => o.id === id) ?? null;
}

/**
 * Test-only hook to clear the module-scoped cache between tests.
 * Pure escape hatch; never call from production code.
 */
export function __resetTenantControlsCacheForTests(): void {
    CACHE.clear();
}
