/**
 * personnel usecase (PR-4) — list + manual entry for the Employee hub.
 * Tenant-scoped via runInTenantContext; permission-gated by the caller
 * (personnel.view / personnel.manage).
 */
import { z } from 'zod';
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { forbidden } from '@/lib/errors/types';
import { logEvent } from '../events/audit';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type { Prisma } from '@prisma/client';

const EMPLOYEE_STATUSES = ['ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'TERMINATED', 'LEAVE'] as const;

export const CreateEmployeeSchema = z.object({
    fullName: z.string().min(1).max(200),
    workEmail: z.string().email().max(320),
    status: z.enum(EMPLOYEE_STATUSES).default('ACTIVE'),
    department: z.string().max(200).optional(),
    jobTitle: z.string().max(200).optional(),
    startDate: z.string().datetime().optional(),
});

export interface EmployeeListRow {
    id: string;
    fullName: string;
    workEmail: string;
    status: string;
    department: string | null;
    jobTitle: string | null;
    managerEmployeeId: string | null;
    source: string;
    startDate: Date | null;
}

export async function listEmployees(
    ctx: RequestContext,
    filters: { status?: string; search?: string } = {},
): Promise<EmployeeListRow[]> {
    return runInTenantContext(ctx, (db) => {
        const where: Prisma.EmployeeWhereInput = { tenantId: ctx.tenantId };
        if (filters.status && EMPLOYEE_STATUSES.includes(filters.status as (typeof EMPLOYEE_STATUSES)[number])) {
            where.status = filters.status as (typeof EMPLOYEE_STATUSES)[number];
        }
        if (filters.search) {
            where.OR = [
                { fullName: { contains: filters.search, mode: 'insensitive' } },
                { workEmail: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        return db.employee.findMany({
            where,
            select: { id: true, fullName: true, workEmail: true, status: true, department: true, jobTitle: true, managerEmployeeId: true, source: true, startDate: true },
            orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
            take: 500,
        });
    });
}

export async function getEmployee(ctx: RequestContext, id: string) {
    return runInTenantContext(ctx, (db) =>
        db.employee.findFirst({
            where: { id, tenantId: ctx.tenantId },
            select: { id: true, fullName: true, workEmail: true, status: true, department: true, jobTitle: true, managerEmployeeId: true, source: true, startDate: true, endDate: true, externalId: true, syncedAt: true },
        }),
    );
}

export async function createEmployee(ctx: RequestContext, data: z.infer<typeof CreateEmployeeSchema>) {
    if (!ctx.permissions?.canAdmin && !ctx.appPermissions?.personnel?.manage) {
        throw forbidden('You do not have permission to manage personnel.');
    }
    return runInTenantContext(ctx, async (db) => {
        const employee = await db.employee.create({
            data: {
                tenantId: ctx.tenantId,
                fullName: sanitizePlainText(data.fullName),
                workEmail: data.workEmail,
                status: data.status,
                department: data.department ? sanitizePlainText(data.department) : null,
                jobTitle: data.jobTitle ? sanitizePlainText(data.jobTitle) : null,
                startDate: data.startDate ? new Date(data.startDate) : null,
                source: 'MANUAL',
            },
        });
        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Employee',
            entityId: employee.id,
            details: `Created employee: ${employee.fullName}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'Employee', operation: 'created', after: { workEmail: employee.workEmail, status: employee.status }, summary: `Created employee: ${employee.fullName}` },
        });
        return employee;
    });
}
