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
 * Convert an in-tenant pathname back into a CanonicalParent shape by
 * looking up the label of the route the user came from. We don't have a
 * "label for any path" registry yet, so for now the smart label uses the
 * IA section name derived from the first segment.
 */
function labelFromPathname(pathname: string): string {
    const stripped = pathname.replace(/^\/t\/[^/]+/, '');
    const seg = stripped.split('/').filter(Boolean)[0];
    if (!seg) return 'previous page';
    return seg.charAt(0).toUpperCase() + seg.slice(1);
}

export interface BackAffordanceProps {
    /** Optional override — used by tests + the `back` prop's static form. */
    override?: CanonicalParent;
}

export function BackAffordance({ override }: BackAffordanceProps) {
    const pathname = usePathname() ?? '';
    const tenantSlug = tenantSlugFromPath(pathname);
    const referrer = usePreviousPath(tenantSlug);

    let destination: CanonicalParent | null = null;
    if (override) {
        destination = override;
    } else if (referrer && tenantSlug && referrer !== pathname) {
        destination = { href: referrer, label: labelFromPathname(referrer) };
    } else if (tenantSlug) {
        destination = resolveCanonicalParent(pathname, tenantSlug);
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
