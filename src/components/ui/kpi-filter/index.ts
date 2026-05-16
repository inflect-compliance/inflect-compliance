/**
 * R23 — KPI filter platform barrel.
 *
 * The shared (hook, types, future utilities) for the clickable-KPI
 * pattern. Consumers should import from this barrel — the underlying
 * file layout is an implementation detail that may evolve as R23
 * picks up per-page rollouts.
 */
export {
    useKpiFilter,
    type KpiFilterDef,
    type UseKpiFilterReturn,
} from "./use-kpi-filter";
