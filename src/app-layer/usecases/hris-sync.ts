/**
 * hris-sync (PR-4) — sync an HRIS roster (BambooHR) into Employee.
 *
 * Idempotent by (tenantId, workEmail). Two passes: upsert every employee,
 * then resolve managerEmail → managerEmployeeId (map workEmail → id). Records
 * ONE IntegrationExecution. Tenant-scoped (runInTenantContext, no global
 * prisma). Mirrors identity-sync.
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { getPermissionsForRole } from '@/lib/permissions';
import { decryptField } from '@/lib/security/encryption';
import { logger } from '@/lib/observability/logger';
import { registry } from '../integrations/registry';
import { isHrisSyncProvider, type HrisSyncProvider, type NormalizedEmployee } from '../integrations/providers/hris';

const HRIS_PROVIDERS = new Set(['bamboohr']);

function makeSystemCtx(tenantId: string): RequestContext {
    return {
        requestId: `hris-sync-${tenantId}`,
        userId: 'system',
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: false },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

export interface HrisSyncResult {
    executionId: string;
    status: 'PASSED' | 'ERROR';
    upserted: number;
    managersLinked: number;
    errorMessage?: string;
}

export async function runHrisSync(input: {
    tenantId: string;
    connectionId: string;
    now?: Date;
    provider?: HrisSyncProvider;
}): Promise<HrisSyncResult> {
    const ctx = makeSystemCtx(input.tenantId);
    const now = input.now ?? new Date();

    return runInTenantContext(ctx, async (db) => {
        const conn = await db.integrationConnection.findFirst({
            where: { id: input.connectionId, tenantId: ctx.tenantId },
            select: { id: true, provider: true, configJson: true, secretEncrypted: true },
        });
        if (!conn || !HRIS_PROVIDERS.has(conn.provider)) {
            const execution = await db.integrationExecution.create({
                data: { tenantId: ctx.tenantId, provider: conn?.provider ?? 'hris', automationKey: 'hris.sync', status: 'ERROR', errorMessage: 'HRIS connection not found', triggeredBy: 'scheduled', completedAt: now },
            });
            return { executionId: execution.id, status: 'ERROR', upserted: 0, managersLinked: 0, errorMessage: 'HRIS connection not found' };
        }

        const config = (conn.configJson ?? {}) as Record<string, unknown>;
        const secrets: Record<string, unknown> = conn.secretEncrypted ? (JSON.parse(decryptField(conn.secretEncrypted)) as Record<string, unknown>) : {};
        const execution = await db.integrationExecution.create({
            data: { tenantId: ctx.tenantId, connectionId: conn.id, provider: conn.provider, automationKey: `${conn.provider}.sync`, status: 'RUNNING', triggeredBy: 'scheduled', executedAt: now },
        });

        const resolved = input.provider ?? registry.getProvider(conn.provider);
        if (!resolved || !isHrisSyncProvider(resolved)) {
            await db.integrationExecution.update({ where: { id: execution.id }, data: { status: 'ERROR', errorMessage: 'Provider does not support HRIS sync', completedAt: new Date() } });
            return { executionId: execution.id, status: 'ERROR', upserted: 0, managersLinked: 0, errorMessage: 'Provider does not support HRIS sync' };
        }

        const start = Date.now();
        let roster: NormalizedEmployee[];
        try {
            roster = await resolved.listEmployees({ ...config, ...secrets });
        } catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
            await db.integrationExecution.update({ where: { id: execution.id }, data: { status: 'ERROR', errorMessage: msg, durationMs: Date.now() - start, completedAt: new Date() } });
            return { executionId: execution.id, status: 'ERROR', upserted: 0, managersLinked: 0, errorMessage: msg };
        }

        // Pass 1 — upsert each employee (no manager yet).
        let upserted = 0;
        for (const e of roster) { // guardrail-allow: n+1 — per-employee upsert, bounded by MAX_EMPLOYEES
            if (!e.workEmail) continue;
            await db.employee.upsert({
                where: { tenantId_workEmail: { tenantId: ctx.tenantId, workEmail: e.workEmail } },
                create: { tenantId: ctx.tenantId, externalId: e.externalId, fullName: e.fullName, workEmail: e.workEmail, status: e.status, department: e.department ?? null, jobTitle: e.jobTitle ?? null, startDate: e.startDate ?? null, endDate: e.endDate ?? null, source: 'HRIS', syncedAt: now },
                update: { externalId: e.externalId, fullName: e.fullName, status: e.status, department: e.department ?? null, jobTitle: e.jobTitle ?? null, startDate: e.startDate ?? null, endDate: e.endDate ?? null, source: 'HRIS', syncedAt: now },
            });
            upserted += 1;
        }

        // Pass 2 — resolve managers by email (one query, in-memory map — no N+1).
        const emailToId = new Map<string, string>();
        const all = await db.employee.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, workEmail: true }, take: 10000 });
        for (const r of all) emailToId.set(r.workEmail.toLowerCase(), r.id);
        let managersLinked = 0;
        for (const e of roster) { // guardrail-allow: n+1 — bounded manager-link update
            if (!e.managerEmail) continue;
            const managerId = emailToId.get(e.managerEmail.toLowerCase());
            const selfId = emailToId.get(e.workEmail.toLowerCase());
            if (!managerId || !selfId || managerId === selfId) continue;
            await db.employee.update({ where: { id: selfId }, data: { managerEmployeeId: managerId } });
            managersLinked += 1;
        }

        await db.integrationExecution.update({
            where: { id: execution.id },
            data: { status: 'PASSED', resultJson: { upserted, managersLinked, total: roster.length }, durationMs: Date.now() - start, completedAt: new Date() },
        });
        logger.info('hris-sync complete', { component: 'hris-sync', tenantId: ctx.tenantId, executionId: execution.id, upserted, managersLinked });
        return { executionId: execution.id, status: 'PASSED', upserted, managersLinked };
    });
}
