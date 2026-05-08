/**
 * /tenants — Tenant picker page (R-1 closure).
 *
 * Rendered when a user has >1 active tenant membership and needs to choose
 * which workspace to enter. Also handles the degenerate cases:
 *   0 memberships → redirect to /no-tenant
 *   1 membership  → redirect directly to that tenant's dashboard
 *
 * This page is listed in PUBLIC_PATH_PREFIXES in guard.ts so the
 * middleware tenant-access gate does not bounce the user trying to
 * reach the picker before an active tenant is set in the JWT.
 */
import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { Heading } from '@/components/ui/typography';

export default async function TenantsPage() {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    const memberships = session.user.memberships ?? [];

    if (memberships.length === 0) {
        redirect('/no-tenant');
    }

    if (memberships.length === 1) {
        redirect(`/t/${memberships[0].slug}/dashboard`);
    }

    // >1 memberships — render the picker
    return (
        <main className="min-h-screen bg-bg-default flex items-center justify-center p-4">
            <div className="max-w-lg w-full">
                <div className="mb-8 text-center">
                    <Heading level={1} className="mb-2">
                        Choose a workspace
                    </Heading>
                    <p className="text-content-muted">
                        You are a member of multiple workspaces. Select one to continue.
                    </p>
                </div>
                <div className="flex flex-col gap-compact">
                    {memberships.map((m) => (
                        <a
                            key={m.slug}
                            href={`/t/${m.slug}/dashboard`}
                            className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-surface px-5 py-4 hover:bg-bg-hover transition-colors"
                        >
                            <div>
                                <p className="font-medium text-content-default">{m.slug}</p>
                                <p className="text-sm text-content-muted capitalize">
                                    {m.role.toLowerCase()}
                                </p>
                            </div>
                            <svg
                                className="h-4 w-4 text-content-muted"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M6 3l5 5-5 5" />
                            </svg>
                        </a>
                    ))}
                </div>
                <div className="mt-6 text-center">
                    <form
                        action={async () => {
                            'use server';
                            await signOut({ redirectTo: '/login' });
                        }}
                    >
                        <button
                            type="submit"
                            className="text-sm text-content-muted hover:text-content-default transition-colors"
                        >
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
