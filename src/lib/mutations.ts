/**
 * Mutation error helper.
 *
 * Once the React Query → SWR migration completed, the only surviving
 * export here is `extractMutationError` — a framework-agnostic funnel that
 * normalises an arbitrary thrown value (Error / string / `{ error }` /
 * `{ message }`) into a displayable string. Mutation call sites (plain
 * async handlers + `useTenantMutation`) reuse it so error copy stays
 * consistent. The former `optimisticListUpdate` (which took a React Query
 * `QueryClient`) was removed with the migration — optimistic list updates
 * now go through `useTenantMutation`'s `optimisticUpdate` option.
 */
export function extractMutationError(err: unknown, fallback = 'An error occurred'): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
        const obj = err as Record<string, unknown>;
        const e = obj.error ?? obj.message ?? fallback;
        return typeof e === 'string' ? e : JSON.stringify(e);
    }
    return fallback;
}
