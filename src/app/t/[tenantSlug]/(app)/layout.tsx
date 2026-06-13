import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/layout/AppShell';
import { ClientProviders } from '@/components/layout/ClientProviders';
import { NavigationTracker } from '@/components/nav/NavigationTracker';

/**
 * Tenant app layout — Server Component.
 *
 * Responsibilities:
 *   - Resolve session server-side (via auth())
 *   - Resolve translations server-side (via getTranslations())
 *   - Compose client wrappers with minimal, serializable props
 *
 * Client boundaries:
 *   - AppShell: layout chrome (sidebar, drawer, mobile bar, signOut)
 *   - ClientProviders: data-layer providers (QueryClientProvider)
 *
 * Tenant context (tenantId, role, permissions) is provided by the parent
 * TenantLayout at src/app/t/[tenantSlug]/layout.tsx.
 */
export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Resolve session server-side — no client-side useSession() needed
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    // Resolve translations server-side — passed as plain string to AppShell
    const tc = await getTranslations('common');

    return (
        <AppShell
            user={{ name: session.user.name }}
            appName={tc('appName')}
        >
            <ClientProviders>
                <NavigationTracker />
                {children}
            </ClientProviders>
        </AppShell>
    );
}
