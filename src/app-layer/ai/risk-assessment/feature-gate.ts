/**
 * AI Risk Assessment — Feature Gate
 *
 * Controls access to AI features based on:
 * 1. Global feature flag (env: AI_RISK_ENABLED) — master kill switch
 * 2. Per-feature enable flag (GAP-2) — disable one feature in isolation
 * 3. Role-based access (admin/editor only)
 * 4. Optional plan-based gating (env: AI_RISK_PLAN_REQUIRED)
 *
 * When billing/entitlements are added, extend `checkPlanEntitlement`
 * to query the tenant's subscription plan.
 */
import { forbidden } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';
import { env } from '@/env';

// ─── Configuration ───

/** Global kill switch for ALL AI features. Set to 'false' to disable. */
const AI_RISK_ENABLED = (env.AI_RISK_ENABLED ?? 'true').toLowerCase() !== 'false';

const isOn = (raw: string | undefined) => (raw ?? 'true').toLowerCase() !== 'false';

/**
 * The AI features that carry an independent enable flag. Each flag is
 * ANDed with the global `AI_RISK_ENABLED` master switch, so an operator
 * can turn off (say) the assistant while leaving risk suggestions on.
 */
export type AiFeature = 'risk' | 'assistant' | 'questionnaire';

/** Per-feature enable flags (GAP-2). Each defaults ON. */
const FEATURE_ENABLED: Readonly<Record<AiFeature, boolean>> = {
    risk: isOn(env.AI_RISK_SUGGESTIONS_ENABLED),
    assistant: isOn(env.AI_ASSISTANT_ENABLED),
    questionnaire: isOn(env.AI_QUESTIONNAIRE_ENABLED),
};

const FEATURE_LABEL: Readonly<Record<AiFeature, string>> = {
    risk: 'AI risk assessment',
    assistant: 'the AI assistant',
    questionnaire: 'AI questionnaire autofill',
};

/**
 * If set, AI risk assessment requires this plan tier.
 * Values: 'pro', 'enterprise', or empty (no plan gating).
 * When billing is implemented, check tenant.plan against this value.
 */
const AI_RISK_PLAN_REQUIRED = env.AI_RISK_PLAN_REQUIRED ?? '';

// ─── Feature Gate ───

export interface FeatureGateResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Check whether AI risk assessment is available for this context.
 * Returns { allowed: true } if all gates pass, or { allowed: false, reason } if blocked.
 */

/**
 * AISVS C5.2.1 (L2) — DEFAULT-DENY ALLOW-LIST.
 *
 * Access to the AI resource is denied by default and granted ONLY when EVERY
 * allow-list predicate below passes (logical AND). Adding a capability requires
 * adding a predicate here — there is no implicit-allow path. Each predicate
 * returns a deny `reason` when it fails; reaching the end of the list is the
 * only way to `allowed: true`.
 */
const AI_ACCESS_ALLOWLIST: ReadonlyArray<(ctx: RequestContext, feature: AiFeature) => FeatureGateResult> = [
    // 1. Global master switch must be on (kill switch for ALL AI features).
    () =>
        AI_RISK_ENABLED
            ? { allowed: true }
            : { allowed: false, reason: 'AI features are currently disabled' },
    // 2. The specific feature's enable flag must be on (GAP-2).
    (_ctx, feature) =>
        FEATURE_ENABLED[feature]
            ? { allowed: true }
            : { allowed: false, reason: `${FEATURE_LABEL[feature]} is currently disabled` },
    // 3. Caller must hold the write capability (Editor / Admin / Owner).
    (ctx) =>
        ctx.permissions.canWrite
            ? { allowed: true }
            : { allowed: false, reason: 'AI features require Editor or Admin role' },
    // 4. Plan entitlement, when a required plan is configured.
    (ctx) =>
        AI_RISK_PLAN_REQUIRED ? checkPlanEntitlement(ctx, AI_RISK_PLAN_REQUIRED) : { allowed: true },
];

export function checkFeatureGate(ctx: RequestContext, feature: AiFeature = 'risk'): FeatureGateResult {
    // Default-deny: return the FIRST failing predicate's reason; reaching the
    // end (every predicate passed) is the only allow path.
    for (const predicate of AI_ACCESS_ALLOWLIST) {
        const result = predicate(ctx, feature);
        if (!result.allowed) return result;
    }
    return { allowed: true };
}

/**
 * Enforce the feature gate — throws forbidden if not allowed.
 *
 * @param feature — which AI feature is being gated (defaults to 'risk'
 *   for backward compatibility). Each feature carries an independent
 *   enable flag ANDed with the global master switch.
 */
export function enforceFeatureGate(ctx: RequestContext, feature: AiFeature = 'risk'): void {
    const result = checkFeatureGate(ctx, feature);
    if (!result.allowed) {
        throw forbidden(result.reason ?? 'This AI feature is not available');
    }
}

/**
 * Check plan entitlement for the tenant.
 *
 * STUB: Currently always returns { allowed: true } since billing is not yet implemented.
 * When billing is added, query the tenant's subscription plan here.
 *
 * Example future implementation:
 * ```
 * const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId } });
 * if (tenant.plan !== requiredPlan && tenant.plan !== 'enterprise') {
 *   return { allowed: false, reason: `AI risk assessment requires ${requiredPlan} plan` };
 * }
 * ```
 */

function checkPlanEntitlement(_ctx: RequestContext, _requiredPlan: string): FeatureGateResult {
    // TODO: Implement plan-based gating when billing/entitlements are available
    // For now, always allow (feature flag + role check are the active gates)
    return { allowed: true };
}

/**
 * Check if AI risk assessment is enabled globally.
 * Useful for UI to conditionally show/hide entry points.
 */
export function isAIRiskEnabled(): boolean {
    return AI_RISK_ENABLED;
}

/**
 * Get the required plan for AI risk features (empty if no plan required).
 */
export function getRequiredPlan(): string {
    return AI_RISK_PLAN_REQUIRED;
}
