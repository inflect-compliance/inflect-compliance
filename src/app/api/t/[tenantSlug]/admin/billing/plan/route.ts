/**
 * Admin API — change a tenant's billing plan.
 *
 *   POST /api/t/:tenantSlug/admin/billing/plan   { "plan": "PRO" }
 *
 * The only first-party path that mutates `BillingAccount.plan` (this
 * deployment has no Stripe webhook). Gated by `admin.tenant_lifecycle`
 * (OWNER-only per the role model in CLAUDE.md) — a plan change has
 * direct billing + entitlement consequences. Emits the
 * `business.plan.upgraded` / `downgraded` KPI via the usecase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { changeTenantPlan } from '@/app-layer/usecases/billing';
import { ValidationError } from '@/lib/errors/types';

const PlanChangeSchema = z.object({
    plan: z.enum(['FREE', 'TRIAL', 'PRO', 'ENTERPRISE']),
});

export const POST = withApiErrorHandling(
    requirePermission('admin.tenant_lifecycle', async (req: NextRequest, _routeArgs, ctx) => {
        const parsed = PlanChangeSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            throw new ValidationError('Body must be { plan: FREE|TRIAL|PRO|ENTERPRISE }');
        }

        const result = await changeTenantPlan(ctx, parsed.data.plan);

        return NextResponse.json(result, { status: 200 });
    }),
);
