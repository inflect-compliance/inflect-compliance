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
}

interface TenantControlsState {
    options: TenantControlOption[];
    loading: boolean;
    error: string | null;
}

// Module-scoped cache. Survives component remounts within the same
// tenant session; cleared on tenant slug change (different key).
const CACHE = new Map<string, TenantControlOption[]>();

export function useTenantControls(
    tenantSlug: string,
): TenantControlsState {
    const cached = CACHE.get(tenantSlug);
    const [state, setState] = useState<TenantControlsState>(() => ({
        options: cached ?? [],
        loading: cached === undefined,
        error: null,
    }));

    useEffect(() => {
        // Empty-string slug → no-op. Lets a rendered test or
        // storybook mount the inspector without standing up the
        // canvas's tenant context.
        if (tenantSlug === "") {
            setState({ options: [], loading: false, error: null });
            return;
        }
        // Hit cache: stable state, no network.
        if (CACHE.has(tenantSlug)) {
            setState({
                options: CACHE.get(tenantSlug) ?? [],
                loading: false,
                error: null,
            });
            return;
        }

        let cancelled = false;
        setState({ options: [], loading: true, error: null });
        const fetchControls = async () => {
            try {
                const res = await fetch(
                    `/api/t/${tenantSlug}/controls`,
                );
                if (!res.ok) {
                    throw new Error(
                        `Could not load controls (${res.status})`,
                    );
                }
                const body = (await res.json()) as unknown;
                // The endpoint shape (`{ controls: [...] }` vs
                // bare array) varies between paginated + non-
                // paginated paths. Normalise both shapes here.
                const rows = Array.isArray(body)
                    ? (body as unknown[])
                    : Array.isArray(
                            (body as { controls?: unknown[] })?.controls,
                        )
                      ? (body as { controls: unknown[] }).controls
                      : [];
                const options: TenantControlOption[] = rows
                    .map((r) => {
                        const row = r as {
                            id?: unknown;
                            ref?: unknown;
                            title?: unknown;
                        };
                        if (typeof row.id !== "string") return null;
                        return {
                            id: row.id,
                            ref:
                                typeof row.ref === "string" ? row.ref : null,
                            title:
                                typeof row.title === "string"
                                    ? row.title
                                    : "(no title)",
                        };
                    })
                    .filter((r): r is TenantControlOption => r !== null);
                CACHE.set(tenantSlug, options);
                if (!cancelled) {
                    setState({ options, loading: false, error: null });
                }
            } catch (err) {
                if (!cancelled) {
                    setState({
                        options: [],
                        loading: false,
                        error:
                            err instanceof Error
                                ? err.message
                                : "Could not load controls",
                    });
                }
            }
        };
        void fetchControls();
        return () => {
            cancelled = true;
        };
    }, [tenantSlug]);

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
 * Test-only hook to clear the module-scoped cache between tests.
 * Pure escape hatch; never call from production code.
 */
export function __resetTenantControlsCacheForTests(): void {
    CACHE.clear();
}
