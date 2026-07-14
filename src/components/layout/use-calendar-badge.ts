'use client';

/**
 * Epic 49 — sidebar Calendar nav badge.
 *
 * Fetches the upcoming-deadline count via plain `fetch` + `useState`
 * — NOT React Query — so the SidebarNav (which mounts inside
 * `<AppShell>`, OUTSIDE `<ClientProviders>`) doesn't need a
 * QueryClient in scope. Refreshes every 5 minutes; the API caps the
 * response at 100 (rendered as `99+`).
 *
 * Design choices:
 *   - Lazy: the hook only runs in the rendered sidebar tree, so no
 *     cost on logged-out pages.
 *   - Cheap: backed by Prisma `count` queries with `take` short-circuits.
 *   - Resilient — any error returns undefined rather than disrupting the nav.
 *   - Provider-free: zero React Query / Context dependencies — the
 *     sidebar must work in any tree.
 *
 * Test-mode opt-out: SidebarContent is mounted twice (desktop +
 * mobile-drawer). Under `NEXT_PUBLIC_TEST_MODE=1` the fetch is
 * skipped entirely (SWR key = null) — the badge is a vanity counter,
 * and even one in-flight interval request per mount was enough to
 * keep `page.waitForLoadState('networkidle')` from settling within
 * the 180s test timeout on a slow CI runner (the 3-min
 * control-edit-modal hang). The flag is the same one that suppresses
 * the Driver.js onboarding tour in
 * `src/components/layout/ClientProviders.tsx` — same rationale.
 *
 * Dedupe (P4.3): both SidebarContent mounts call this hook with the
 * SAME tenant-scoped SWR key, so SWR's module-level cache collapses
 * the two mounts (and any React strict-mode double-effect) into a
 * SINGLE in-flight `/calendar/upcoming-count` request and a single
 * shared 5-minute refresh timer. Plain `useSWR` (not `useTenantSWR`)
 * is deliberate: the SidebarNav mounts inside `<AppShell>`, OUTSIDE
 * `<ClientProviders>`, so there is no tenant-context/QueryClient in
 * scope — SWR's default global cache needs no provider.
 */

import useSWR from 'swr';

interface UpcomingCountResponse {
    count: number;
}

const REFRESH_MS = 5 * 60_000; // 5 minutes
// Read at module load — NEXT_PUBLIC_* vars are inlined at build time.
const SUPPRESS_IN_TEST = process.env.NEXT_PUBLIC_TEST_MODE === '1';

async function fetchUpcomingCount(url: string): Promise<number | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data: UpcomingCountResponse = await res.json();
        return data.count;
    } catch {
        // Network errors / aborts — leave the badge hidden, don't
        // disrupt the nav.
        return null;
    }
}

export function useCalendarBadge(tenantSlug: string): string | number | undefined {
    // A `null` key tells SWR not to fetch (test mode / no tenant). A
    // string key is shared across both sidebar mounts, so SWR dedupes
    // the request and the interval refresh to a single network call.
    const key =
        tenantSlug && !SUPPRESS_IN_TEST
            ? `/api/t/${tenantSlug}/calendar/upcoming-count`
            : null;

    const { data: count } = useSWR<number | null>(key, fetchUpcomingCount, {
        refreshInterval: REFRESH_MS,
        // Collapse concurrent revalidations for this key (both mounts'
        // interval timers) into one request.
        dedupingInterval: REFRESH_MS,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    });

    if (count == null || count <= 0) return undefined;
    if (count > 99) return '99+';
    return count;
}
