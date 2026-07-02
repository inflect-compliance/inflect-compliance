/**
 * aws-posture-collect job — run one tenant's AWS posture benchmark and record
 * the IntegrationExecution + auto-collected Evidence. Thin delegator to the
 * `runAwsPostureCollection` usecase; tenantId + connectionId travel in the
 * payload and the usecase builds its own tenant-scoped context (runInTenantContext).
 */
import { runAwsPostureCollection } from '@/app-layer/usecases/aws-posture';
import type { AwsPostureCollectPayload } from './types';

export async function runAwsPostureCollectJob(payload: AwsPostureCollectPayload): Promise<{
    executionId: string;
    status: string;
    evidenceCreated: number;
}> {
    if (!payload.tenantId || !payload.connectionId) {
        throw new Error('aws-posture-collect requires tenantId + connectionId');
    }
    const r = await runAwsPostureCollection({ tenantId: payload.tenantId, connectionId: payload.connectionId });
    return { executionId: r.executionId, status: r.status, evidenceCreated: r.evidenceCreated };
}
