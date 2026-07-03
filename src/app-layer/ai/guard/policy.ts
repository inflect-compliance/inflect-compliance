/**
 * AI Guard — per-tenant policy + enforcement contract.
 *
 * A tenant's guard mode is stored on `TenantSecuritySettings.aiGuardMode`
 * (Prisma enum `AiGuardMode`, default `BALANCED`). We reuse that existing
 * per-tenant security row rather than introduce a new settings surface.
 *
 * Enforcement contract (the resolved `action` the compose helpers apply):
 *
 *   ┌────────────┬───────────────────────────┬───────────────────────────┐
 *   │  mode      │  input direction          │  egress direction         │
 *   ├────────────┼───────────────────────────┼───────────────────────────┤
 *   │  strict    │ malicious → BLOCK         │ secret(malicious) → BLOCK │
 *   │            │ suspicious → FLAG         │ suspicious → FLAG         │
 *   │  balanced  │ malicious → FLAG          │ secret(malicious) → BLOCK │
 *   │  (default) │ suspicious → FLAG         │ suspicious → FLAG         │
 *   │  audit     │ log only → ALLOW          │ log only → ALLOW          │
 *   └────────────┴───────────────────────────┴───────────────────────────┘
 *
 *   - BLOCK — strict: refuse the model call / drop the proposed action.
 *   - FLAG  — balanced: allow, but force human review; NEVER auto-commit.
 *   - ALLOW — clean, or audit-mode (recorded, not enforced).
 *
 * A leaked secret in OUTBOUND content is blocked in both strict AND balanced
 * (a secret must never leave the boundary or be committed); audit mode is the
 * only escape hatch and is a deliberate, per-tenant opt-in for triage.
 *
 * Pure — takes the settings row (or null) and a scan verdict, returns an
 * action. The DB read happens in the compose helpers (`index.ts`).
 */
import type { GuardVerdict } from './injection-scanner';

export type GuardMode = 'strict' | 'balanced' | 'audit';
export type GuardAction = 'allow' | 'flag' | 'block';
export type GuardDirection = 'input' | 'egress';

export const DEFAULT_GUARD_MODE: GuardMode = 'balanced';

/** Resolve the domain guard mode from a settings row's `aiGuardMode` value. */
export function resolveGuardMode(
    settings: { aiGuardMode?: string | null } | null | undefined,
): GuardMode {
    switch ((settings?.aiGuardMode ?? '').toUpperCase()) {
        case 'STRICT':
            return 'strict';
        case 'AUDIT':
            return 'audit';
        case 'BALANCED':
            return 'balanced';
        default:
            return DEFAULT_GUARD_MODE;
    }
}

/**
 * Resolve the enforcement action for a verdict under a mode + direction.
 * See the contract table above.
 */
export function resolveEnforcement(
    mode: GuardMode,
    verdict: GuardVerdict,
    direction: GuardDirection,
): GuardAction {
    if (verdict === 'clean') return 'allow';
    // Audit mode never enforces — it records only.
    if (mode === 'audit') return 'allow';

    if (verdict === 'malicious') {
        if (direction === 'egress') return 'block'; // secrets never leave / commit
        return mode === 'strict' ? 'block' : 'flag';
    }

    // suspicious → flag under strict + balanced.
    return 'flag';
}
