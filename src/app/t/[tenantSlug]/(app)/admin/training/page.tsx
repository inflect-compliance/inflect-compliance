import { getTenantCtx } from '@/app-layer/context';
import { listTrainingAssignments } from '@/app-layer/usecases/training';
import { TrainingClient, type AssignmentRow } from './TrainingClient';

export const dynamic = 'force-dynamic';

/**
 * Training (PR-6) — Server Component. Security-awareness training assignments.
 * Part of the people layer (personnel.view).
 */
export default async function TrainingPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const rows = (await listTrainingAssignments(ctx)) as unknown as AssignmentRow[];
    return <TrainingClient initialRows={JSON.parse(JSON.stringify(rows))} />;
}
