/**
 * Dashboard chart-focus coordination context.
 *
 * The dashboard's KPI tiles (control coverage, risks, evidence,
 * tasks, policies, findings) and the charts below them speak one
 * coordinated focus state — this is a *highlight* affordance, not a
 * data filter:
 *
 *   • Clicking a KPI tile sets that tile as the "current focus."
 *   • Charts subscribe to the focus via `useDashboardChartFocus()`.
 *   • When a KPI is focused, its owning chart gains a brand ring and
 *     every other chart dims to 60% — the data each chart renders is
 *     unchanged. The interaction draws the eye; it does not re-query
 *     or re-slice any section's dataset. (Per-resource data filtering
 *     was considered and dropped: "filter the evidence donut to the
 *     risks KPI" has no coherent meaning — each chart already owns its
 *     own resource.)
 *
 * Why a context rather than prop-drilling:
 *   • Six KPI tiles × four chart sections × the masthead is a
 *     ~30-edge graph if propped — visual fan-out would dwarf the
 *     actual logic.
 *   • The eventual segment-row click on the donut wants the same
 *     setter. A single context is the canonical join point.
 *
 * The KPI keys are typed as a finite union — adding a new tile
 * type requires touching this file, which in turn forces the
 * focus-aware chart consumers to handle the new case.
 *
 * Default state: `null` — no tile focused, every chart at full
 * opacity with no ring.
 */
'use client';

import * as React from 'react';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Canonical KPI key set. Each value corresponds 1:1 to one of the
 * `<KpiCard>` tiles in the dashboard grid. Adding a tile means
 * adding a key here; the type-narrowing in the focus-aware chart
 * consumers forces the new key to be handled at every subscription
 * site.
 */
export type DashboardKpiKey =
    | 'coverage'
    | 'risks'
    | 'evidence'
    | 'tasks'
    | 'policies'
    | 'findings';

/** Public shape of the context for consumers. */
export interface DashboardChartFocus {
    /** Currently focused KPI, or `null` when no tile is selected. */
    selectedKpi: DashboardKpiKey | null;
    /**
     * Set the focus. Pass `null` to clear. The setter is stable
     * across renders so consumers can list it in effect deps
     * without triggering re-runs.
     */
    setSelectedKpi: (kpi: DashboardKpiKey | null) => void;
    /**
     * Toggle the focus on/off for a given key. Clicking the
     * currently-selected tile clears the filter; clicking any
     * other tile sets it.
     */
    toggleSelectedKpi: (kpi: DashboardKpiKey) => void;
}

// ─── Context ─────────────────────────────────────────────────────────

/**
 * Internal context handle. We don't export the bare Context so
 * consumers go through `useDashboardChartFocus()` and get a
 * clear error if they're outside the provider.
 */
const DashboardChartFocusContext =
    React.createContext<DashboardChartFocus | null>(null);

// ─── Provider ────────────────────────────────────────────────────────

interface DashboardChartProviderProps {
    children: React.ReactNode;
}

export function DashboardChartProvider({
    children,
}: DashboardChartProviderProps) {
    const [selectedKpi, setSelectedKpi] =
        React.useState<DashboardKpiKey | null>(null);

    const toggleSelectedKpi = React.useCallback(
        (kpi: DashboardKpiKey) => {
            setSelectedKpi((current) => (current === kpi ? null : kpi));
        },
        [],
    );

    const value = React.useMemo<DashboardChartFocus>(
        () => ({
            selectedKpi,
            setSelectedKpi,
            toggleSelectedKpi,
        }),
        [selectedKpi, toggleSelectedKpi],
    );

    return (
        <DashboardChartFocusContext.Provider value={value}>
            {children}
        </DashboardChartFocusContext.Provider>
    );
}

// ─── Hook ────────────────────────────────────────────────────────────

/**
 * Subscribe to the dashboard chart-focus state. Throws if called
 * outside a `<DashboardChartProvider>` — keeps the misuse fail-
 * fast at the call site instead of producing silent "no focus
 * ever fires" behaviour.
 */
export function useDashboardChartFocus(): DashboardChartFocus {
    const ctx = React.useContext(DashboardChartFocusContext);
    if (!ctx) {
        throw new Error(
            'useDashboardChartFocus must be used inside <DashboardChartProvider>',
        );
    }
    return ctx;
}
