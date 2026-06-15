'use client';

/**
 * RQ4-4 — Back affordance primitive.
 *
 * The thin "← Back to <Destination>" row that renders above the page
 * title on every subpage. Two-tier resolution:
 *
 *   1. Referrer (smart) — the in-tenant pathname the user just navigated
 *      from, read from per-tab sessionStorage via `usePreviousPath` (RQ4-3).
 *   2. Canonical fallback — when no referrer is available (cold load,
 *      deep link, fresh tab), the IA-canonical parent from
 *      `resolveCanonicalParent` (RQ4-4).
 *
 * The primitive ALWAYS resolves — there is no "no back affordance"
 * branch once the page mounts. OB-D: a deep-linked subpage still shows
 * "Back to <Section>".
 *
 * `<PageHeader>` accepts `back={{ smart: true }}` to mount this primitive,
 * keeping the existing static `{ href, label }` form working unchanged.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from '@/components/ui/icons/nucleo';
import {
    usePreviousPath,
    tenantSlugFromPath,
} from '@/lib/nav/usePreviousPath';
import {
    resolveCanonicalParent,
    type CanonicalParent,
} from '@/lib/nav/canonical-parents';

/**
 * Map of in-tenant section paths to their canonical display names.
 *
 * `labelFromPathname` consults this map first; an unmapped section
 * falls back to capitalising the first segment. The map lets the
 * referrer-based affordance show the right product name (e.g.
 * `/audits` → "Internal Audit", not the raw "Audits") without forcing
 * every section to be listed.
 */
const SECTION_LABELS: Record<string, string> = {
    '/access-reviews': 'Access reviews',
    '/admin': 'Admin',
    '/assets': 'Assets',
    '/audits': 'Internal Audit',
    '/calendar': 'Calendar',
    '/clauses': 'Clauses',
    '/controls': 'Controls',
    '/coverage': 'Coverage',
    '/dashboard': 'Dashboard',
    '/evidence': 'Evidence',
    '/findings': 'Findings',
    '/frameworks': 'Frameworks',
    '/issues': 'Issues',
    '/mapping': 'Mapping',
    '/notifications': 'Notifications',
    '/policies': 'Policies',
    '/processes': 'Processes',
    '/reports': 'Reports',
    '/risks': 'Risks',
    '/tasks': 'Tasks',
    '/tests': 'Tests',
    '/vendors': 'Vendors',
};

/**
 * Convert an in-tenant pathname back into a CanonicalParent shape by
 * looking up the label of the route the user came from. We don't have a
 * "label for any path" registry yet, so for now the smart label uses the
 * IA section name derived from the first segment.
 */
function labelFromPathname(pathname: string): string {
    const stripped = pathname.replace(/^\/t\/[^/]+/, '');
    const seg = stripped.split('/').filter(Boolean)[0];
    if (!seg) return 'previous page';
    const sectionKey = `/${seg}`;
    if (SECTION_LABELS[sectionKey]) return SECTION_LABELS[sectionKey];
    return seg.charAt(0).toUpperCase() + seg.slice(1);
}

export interface BackAffordanceProps {
    /** Optional override — used by tests + the `back` prop's static form. */
    override?: CanonicalParent;
    /**
     * When true, render ONLY when an in-tab referrer exists. With no
     * referrer (cold load, deep link, fresh tab), the component
     * returns null — no canonical-parent fallback.
     *
     * Use this variant on MAIN pages that are sometimes deep-linked
     * FROM elsewhere (e.g. `/clauses`, `/findings` reached from
     * `/audits`). The OB-H invariant — "no MAIN page renders an
     * IA-canonical back fallback" — stays intact; only the
     * "where you came from" arm remains.
     */
    noFallback?: boolean;
}

export function BackAffordance({ override, noFallback }: BackAffordanceProps) {
    const pathname = usePathname() ?? '';
    const tenantSlug = tenantSlugFromPath(pathname);
    const referrer = usePreviousPath(tenantSlug);

    let destination: CanonicalParent | null = null;
    if (override) {
        destination = override;
    } else if (tenantSlug) {
        const canonical = noFallback
            ? null
            : resolveCanonicalParent(pathname, tenantSlug);
        // Sibling-detail guard: when the referrer is a SIBLING of the current
        // page (both resolve to the same canonical parent — e.g. stepping
        // /assets/A → /assets/B via the prev/next nav), "back" must NOT return
        // to the sibling (that's the circular back-to-back-asset bug). Skip the
        // referrer and go straight to the shared canonical parent (the list).
        const referrerIsSibling =
            referrer != null &&
            canonical != null &&
            resolveCanonicalParent(referrer, tenantSlug)?.href === canonical.href;
        if (referrer && referrer !== pathname && !referrerIsSibling) {
            destination = { href: referrer, label: labelFromPathname(referrer) };
        } else {
            destination = canonical;
        }
    }

    if (!destination) return null;

    return (
        <Link
            href={destination.href}
            className="inline-flex items-center gap-1 text-content-muted text-xs hover:text-content-emphasis motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out print:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-default rounded-sm"
            data-testid="page-header-back"
            aria-label={`Back to ${destination.label}`}
        >
            <ArrowLeft
                aria-hidden="true"
                className="h-3.5 w-3.5"
            />
            <span>Back to {destination.label}</span>
        </Link>
    );
}
