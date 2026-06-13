/**
 * RQ4-1 — Page/subpage segregation source of truth.
 *
 * Every tenant-scoped route is classified as either:
 *
 *   - MAIN     — a top-level sidebar destination. NO back affordance.
 *   - SUBPAGE  — every other route. MUST mount a back affordance.
 *
 * This file is the single structural fact every later RQ4 ratchet reads
 * from. When a new route lands under `src/app/t/[tenantSlug]/(app)/`, it
 * MUST be added here — RQ4-1's ratchet (`tests/guards/rq4-1-page-segregation.test.ts`)
 * walks the filesystem and fails CI if a `page.tsx` exists that this file
 * does not classify.
 *
 * Routes are stored without the `/t/[tenantSlug]` prefix — they're written
 * as the user sees them in the address bar (e.g. `/risks`, `/risks/[riskId]`).
 * Dynamic segments use the Next.js `[param]` form verbatim so the file is
 * grep-able against the route tree.
 */

export type RouteClass = 'main' | 'subpage' | 'unknown';

/**
 * Subpages that intentionally DO NOT render `<BackAffordance>`.
 *
 *   - **Redirect shims** (`/controls/new`, `/risks/new`, `/issues/*`) —
 *     these files only call `redirect()`; there's no UI to attach the
 *     affordance to.
 *   - **Auth + onboarding flow pages** (`/auth/mfa`, `/onboarding`) —
 *     a back affordance would let the user bypass a required gating
 *     step. Wrong affordance for the page's job.
 *   - **Print views** (`/reports/soa/print`) — print CSS hides nav chrome
 *     anyway, and the print page has its own minimal frame.
 *
 * The RQ4-10 cohort-sweep ratchet reads this list and exempts every
 * entry from the positive-coverage assertion. Add an entry HERE with a
 * comment naming the reason; never silently strip a BackAffordance
 * import from a page.
 */
export const BACK_AFFORDANCE_EXEMPT_SUBPAGES: readonly string[] = [
    '/auth/mfa',              // auth flow — back would bypass MFA challenge
    '/controls/new',          // redirect shim → /controls?create=1
    '/issues/[issueId]',      // legacy redirect → /tasks/[taskId]
    '/issues/dashboard',      // legacy redirect → /tasks/dashboard
    '/issues/new',            // legacy redirect → /tasks/new
    '/onboarding',            // forced flow — back would skip required step
    '/reports/soa/print',     // print view, chrome-less by design
    '/risks/new',             // redirect shim → /risks?create=1
] as const;

/**
 * Top-level sidebar destinations. These pages are reached from the primary
 * navigation; they have no parent within the tenant scope. The back
 * affordance is forbidden here.
 */
export const MAIN_PAGES: readonly string[] = [
    '/admin',
    '/assets',
    '/audits',
    '/clauses',
    '/controls',
    '/coverage',
    '/dashboard',
    '/evidence',
    '/findings',
    '/frameworks',
    '/issues',
    '/mapping',
    '/notifications',
    '/policies',
    '/reports',
    '/risks',
    '/tasks',
    '/tests',
    '/vendors',
] as const;

/**
 * Every other tenant-scoped route. The back affordance is required here.
 *
 * Dynamic segments are written as `[param]` and matched literally — the
 * `classifyRoute` helper normalises a runtime pathname to the same form
 * before lookup.
 */
export const SUBPAGES: readonly string[] = [
    // Admin subpages
    '/admin/api-keys',
    '/admin/billing',
    '/admin/integrations',
    '/admin/members',
    '/admin/notifications',
    '/admin/rbac',
    '/admin/risk-matrix',
    '/admin/roles',
    '/admin/scim',
    '/admin/security',
    '/admin/sso',

    // Assets
    '/assets/[id]',

    // Audits
    '/audits/auditor',
    '/audits/cycles',
    '/audits/cycles/[cycleId]',
    '/audits/cycles/[cycleId]/readiness',
    '/audits/packs/[packId]',
    '/audits/readiness',

    // Auth (in-app)
    '/auth/mfa',

    // Controls
    '/controls/[controlId]',
    '/controls/[controlId]/tests/[planId]',
    '/controls/dashboard',
    '/controls/new',
    '/controls/templates',

    // Frameworks
    '/frameworks/[frameworkKey]',
    '/frameworks/[frameworkKey]/diff',
    '/frameworks/[frameworkKey]/install',
    '/frameworks/[frameworkKey]/templates',

    // Issues
    '/issues/[issueId]',
    '/issues/dashboard',
    '/issues/new',

    // Onboarding
    '/onboarding',

    // Policies
    '/policies/[policyId]',
    '/policies/new',
    '/policies/templates',

    // Reports
    '/reports/soa',
    '/reports/soa/print',

    // Risks
    '/risks/[riskId]',
    '/risks/ai',
    '/risks/dashboard',
    '/risks/import',
    '/risks/new',

    // Security (self-service)
    '/security/mfa',

    // Tasks
    '/tasks/[taskId]',
    '/tasks/dashboard',
    '/tasks/new',

    // Tests
    '/tests/dashboard',
    '/tests/due',
    '/tests/runs/[runId]',

    // Vendors
    '/vendors/[vendorId]',
    '/vendors/[vendorId]/assessment/[assessmentId]',
    '/vendors/dashboard',
    '/vendors/new',
] as const;

/**
 * Normalise a runtime pathname (with the tenant prefix and concrete dynamic
 * segment values) to the canonical form used in `MAIN_PAGES` / `SUBPAGES`.
 *
 *   /t/acme/risks/abc-123  →  /risks/[riskId]
 *   /t/acme/dashboard      →  /dashboard
 *
 * Returns the stripped path on a match, `null` if it doesn't fit the
 * tenant-scoped shape.
 */
export function normalizePathname(pathname: string): string | null {
    const stripped = pathname.replace(/^\/t\/[^/]+/, '');
    if (!stripped.startsWith('/')) return null;

    const sorted = [...MAIN_PAGES, ...SUBPAGES].sort(
        (a, b) => b.split('/').length - a.split('/').length,
    );

    for (const pattern of sorted) {
        if (matchesPattern(stripped, pattern)) return pattern;
    }
    return null;
}

function matchesPattern(pathname: string, pattern: string): boolean {
    const pathSegs = pathname.split('/').filter(Boolean);
    const patternSegs = pattern.split('/').filter(Boolean);
    if (pathSegs.length !== patternSegs.length) return false;
    for (let i = 0; i < patternSegs.length; i++) {
        const p = patternSegs[i];
        if (p.startsWith('[') && p.endsWith(']')) continue;
        if (p !== pathSegs[i]) return false;
    }
    return true;
}

/**
 * Classify a runtime pathname. Returns:
 *   - 'main'     — the route is in `MAIN_PAGES` (no back affordance)
 *   - 'subpage'  — the route is in `SUBPAGES` (back affordance required)
 *   - 'unknown'  — the route is outside the tenant scope or not classified
 */
export function classifyRoute(pathname: string): RouteClass {
    const normalized = normalizePathname(pathname);
    if (!normalized) return 'unknown';
    if ((MAIN_PAGES as readonly string[]).includes(normalized)) return 'main';
    if ((SUBPAGES as readonly string[]).includes(normalized)) return 'subpage';
    return 'unknown';
}
