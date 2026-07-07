/**
 * identity-sync — enumerate a connected directory (Okta / Google Workspace)
 * and upsert its accounts into `ConnectedIdentityAccount`, recording ONE
 * `IntegrationExecution`. Idempotent by `(tenantId, provider,
 * externalUserId)`; accounts that vanish from the directory are reconciled
 * to DEPROVISIONED so PR-4's offboarded-access check stays accurate.
 *
 * Mirrors `aws-posture.ts`: runs entirely inside `runInTenantContext`
 * (tenant-scoped, RLS-bound, no global prisma). Directory metadata only —
 * email + status flags, not content — so nothing is encrypted here.
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { getPermissionsForRole } from '@/lib/permissions';
import { decryptField } from '@/lib/security/encryption';
import { logger } from '@/lib/observability/logger';
import { registry } from '../integrations/registry';
import { isIdentitySyncProvider, type IdentitySyncProvider, type NormalizedIdentityAccount } from '../integrations/providers/identity/types';

const IDENTITY_PROVIDERS = new Set(['okta', 'google-workspace']);

function makeSystemCtx(tenantId: string): RequestContext {
    return {
        requestId: `identity-sync-${tenantId}`,
        userId: 'system',
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: false },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

export interface IdentitySyncResult {
    executionId: string;
    status: 'PASSED' | 'ERROR';
    upserted: number;
    deprovisioned: number;
    errorMessage?: string;
}

/**
 * Sync one identity connection end-to-end. `connectionId` selects the
 * connection (provider must be okta / google-workspace). `provider` and
 * `now` are injectable for tests.
 */
export async function runIdentitySync(input: {
    tenantId: string;
    connectionId: string;
    now?: Date;
    provider?: IdentitySyncProvider;
}): Promise<IdentitySyncResult> {
    const ctx = makeSystemCtx(input.tenantId);
    const now = input.now ?? new Date();

    return runInTenantContext(ctx, async (db) => {
        const conn = await db.integrationConnection.findFirst({
            where: { id: input.connectionId, tenantId: ctx.tenantId },
            select: { id: true, provider: true, configJson: true, secretEncrypted: true, isEnabled: true },
        });
        if (!conn || !IDENTITY_PROVIDERS.has(conn.provider)) {
            const execution = await db.integrationExecution.create({
                data: {
                    tenantId: ctx.tenantId,
                    provider: conn?.provider ?? 'identity',
                    automationKey: 'identity.sync',
                    status: 'ERROR',
                    errorMessage: 'Identity connection not found',
                    triggeredBy: 'scheduled',
                    completedAt: now,
                },
            });
            return { executionId: execution.id, status: 'ERROR', upserted: 0, deprovisioned: 0, errorMessage: 'Identity connection not found' };
        }

        const automationKey = `${conn.provider}.sync`;
        const config = (conn.configJson ?? {}) as Record<string, unknown>;
        const secrets: Record<string, unknown> = conn.secretEncrypted
            ? (JSON.parse(decryptField(conn.secretEncrypted)) as Record<string, unknown>)
            : {};

        const execution = await db.integrationExecution.create({
            data: { tenantId: ctx.tenantId, connectionId: conn.id, provider: conn.provider, automationKey, status: 'RUNNING', triggeredBy: 'scheduled', executedAt: now },
        });

        // Resolve the provider (registry instance in prod; injected in tests).
        const resolved = input.provider ?? registry.getProvider(conn.provider);
        if (!resolved || !isIdentitySyncProvider(resolved)) {
            await db.integrationExecution.update({
                where: { id: execution.id },
                data: { status: 'ERROR', errorMessage: `Provider ${conn.provider} does not support identity sync`, completedAt: new Date() },
            });
            return { executionId: execution.id, status: 'ERROR', upserted: 0, deprovisioned: 0, errorMessage: 'Provider does not support identity sync' };
        }

        const start = Date.now();
        let accounts: NormalizedIdentityAccount[];
        try {
            accounts = await resolved.listAccounts({ ...config, ...secrets });
        } catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
            await db.integrationExecution.update({
                where: { id: execution.id },
                data: { status: 'ERROR', errorMessage: msg, durationMs: Date.now() - start, completedAt: new Date() },
            });
            return { executionId: execution.id, status: 'ERROR', upserted: 0, deprovisioned: 0, errorMessage: msg };
        }

        // Upsert each account idempotently by (tenantId, provider, externalUserId).
        let upserted = 0;
        const seen: string[] = [];
        for (const a of accounts) { // guardrail-allow: n+1 — per-account upsert, bounded by MAX_USERS
            if (!a.externalUserId) continue;
            seen.push(a.externalUserId);
            await db.connectedIdentityAccount.upsert({
                where: { tenantId_provider_externalUserId: { tenantId: ctx.tenantId, provider: conn.provider, externalUserId: a.externalUserId } },
                create: {
                    tenantId: ctx.tenantId,
                    provider: conn.provider,
                    externalUserId: a.externalUserId,
                    email: a.email,
                    displayName: a.displayName ?? null,
                    status: a.status,
                    isAdmin: a.isAdmin ?? false,
                    mfaEnrolled: a.mfaEnrolled ?? false,
                    groupsJson: a.groups,
                    lastActiveAt: a.lastActiveAt ?? null,
                    syncedAt: now,
                },
                update: {
                    email: a.email,
                    displayName: a.displayName ?? null,
                    status: a.status,
                    isAdmin: a.isAdmin ?? false,
                    mfaEnrolled: a.mfaEnrolled ?? false,
                    groupsJson: a.groups,
                    lastActiveAt: a.lastActiveAt ?? null,
                    syncedAt: now,
                },
            });
            upserted += 1;
        }

        // Reconcile still-ACTIVE accounts no longer in the directory — they
        // are now deprovisioned. Bounded updateMany (NOT in the seen set).
        const reconcile = await db.connectedIdentityAccount.updateMany({
            where: {
                tenantId: ctx.tenantId,
                provider: conn.provider,
                status: { not: 'DEPROVISIONED' },
                externalUserId: { notIn: seen.length > 0 ? seen : ['__none__'] },
            },
            data: { status: 'DEPROVISIONED', syncedAt: now },
        });

        await db.integrationExecution.update({
            where: { id: execution.id },
            data: {
                status: 'PASSED',
                resultJson: { upserted, deprovisioned: reconcile.count, total: accounts.length },
                durationMs: Date.now() - start,
                completedAt: new Date(),
            },
        });

        logger.info('identity-sync complete', { component: 'identity-sync', tenantId: ctx.tenantId, provider: conn.provider, executionId: execution.id, upserted, deprovisioned: reconcile.count });
        return { executionId: execution.id, status: 'PASSED', upserted, deprovisioned: reconcile.count };
    });
}
