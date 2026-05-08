'use client';

// GAP-05 — Next 15 disallows `next/dynamic({ ssr: false })` in
// Server Components. The wizard needs SSR off (it has localStorage
// reads + browser-only hydration paths). Marking the page as a
// Client Component lets the dynamic import keep `ssr: false`.
//
// The previous server-side `fetchCache = 'force-no-store'` directive
// is no longer applicable here — `fetchCache` only configures
// server-side fetch() caching, which a client-component page never
// performs. The wizard's data fetches go through the client SWR
// layer which has its own cache contract.
import dynamic from 'next/dynamic';
import { SkeletonCard, SkeletonHeading } from '@/components/ui/skeleton';

const OnboardingWizard = dynamic(
    () => import('@/components/onboarding/OnboardingWizard'),
    {
        loading: () => (
            <div className="space-y-section animate-fadeIn" aria-busy="true">
                <SkeletonHeading className="w-full sm:w-48" />
                <SkeletonCard lines={6} />
            </div>
        ),
        ssr: false,
    }
);

export default function OnboardingPage() {
    return <OnboardingWizard />;
}
