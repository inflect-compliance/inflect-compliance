import { redirect } from 'next/navigation';

/**
 * `/tasks/new` compatibility shim — modal-form P2.
 *
 * Task creation moved from a full-page form into a modal mounted on
 * the tasks list (`src/.../tasks/NewTaskModal.tsx`). Bookmarks, deep
 * links, and E2E `page.goto('/tasks/new')` continue to work — they
 * all land on `/tasks?create=1`, which TasksClient detects on mount.
 */
export default async function NewTaskRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/tasks?create=1`);
}
