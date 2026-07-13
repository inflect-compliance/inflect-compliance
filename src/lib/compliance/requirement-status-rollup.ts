/**
 * Shared per-requirement status rollup — the ONE canonical implementation
 * of "given the controls mapped to a requirement, what is that requirement's
 * implementation verdict?".
 *
 * Before this module the rollup was duplicated and divergent: the ISO SoA
 * (`usecases/soa.ts`) had its own `STATUS_ORDER` that silently dropped
 * `PLANNED` and `IMPLEMENTING` from `worstStatus` (a control in either state
 * contributed nothing to its requirement's rollup), while per-framework
 * coverage (`usecases/framework/coverage.ts`) computed no per-requirement
 * verdict at all. A control bulk-set to PLANNED/IMPLEMENTING was therefore
 * silently excluded from the ISO SoA rollup and invisible to every other
 * framework's readiness.
 *
 * Both the SoA and the framework coverage/readiness rollups now import from
 * here, so the verdict is identical everywhere. The set below is the SINGLE
 * source of truth for the control-status vocabulary in posture rollups; it
 * must stay in lockstep with the Prisma `ControlStatus` enum
 * (prisma/schema/enums.prisma) — the guardrail
 * `tests/guards/control-posture-invariants.test.ts` fails CI if they drift.
 *
 * P5 (control exceptions) layers an `EXCEPTED` verdict on top of this rollup;
 * it belongs here too so it flows to every framework, not just the ISO SoA.
 */

/** Every member of the Prisma `ControlStatus` enum. */
export const CANONICAL_CONTROL_STATUSES = [
    'NOT_STARTED',
    'PLANNED',
    'IN_PROGRESS',
    'IMPLEMENTING',
    'IMPLEMENTED',
    'NEEDS_REVIEW',
    'NOT_APPLICABLE',
] as const;

export type ControlStatus = (typeof CANONICAL_CONTROL_STATUSES)[number];

/**
 * Progress ordering, worst → best. Higher = closer to implemented. Every
 * status the enum can hold is present so none is silently excluded from a
 * rollup. `NOT_APPLICABLE` is -1 — deliberately below zero so it is filtered
 * out of the applicable-control rollup rather than treated as a real gap.
 *
 * Only `IMPLEMENTED` is "covered"; NEEDS_REVIEW sits just below it (built but
 * not yet signed off), IMPLEMENTING/IN_PROGRESS/PLANNED are progressive gaps.
 */
export const STATUS_ORDER: Record<string, number> = {
    NOT_APPLICABLE: -1,
    NOT_STARTED: 0,
    PLANNED: 1,
    IN_PROGRESS: 2,
    IMPLEMENTING: 3,
    NEEDS_REVIEW: 4,
    IMPLEMENTED: 5,
};

/** The single "fully implemented" terminal status. */
export const IMPLEMENTED_STATUS = 'IMPLEMENTED';

/**
 * The worst (least-implemented) status among a set of control statuses,
 * ignoring NOT_APPLICABLE. Returns null when no applicable control remains.
 */
export function worstStatus(statuses: string[]): string | null {
    const applicable = statuses.filter(
        (s) => STATUS_ORDER[s] !== undefined && STATUS_ORDER[s] >= 0,
    );
    if (applicable.length === 0) return null;
    applicable.sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);
    return applicable[0];
}

/** Whether a rolled-up status counts as implemented/covered. */
export function isImplemented(status: string | null | undefined): boolean {
    return status === IMPLEMENTED_STATUS;
}

// ─── Per-requirement verdict (R2-P5 — the shared rollup + EXCEPTED) ───

/**
 * The verdict for a requirement, computed from the controls mapped to it.
 * This is the SINGLE per-requirement rollup used by BOTH the ISO SoA and
 * every framework's coverage/readiness, so the verdict is identical
 * everywhere — including the EXCEPTED state, which therefore flows to all
 * frameworks, not just the ISO SoA.
 */
export type RequirementVerdict =
    | 'unmapped' // no controls mapped
    | 'not-applicable' // only NOT_APPLICABLE controls mapped
    | 'implemented' // worst applicable control is IMPLEMENTED
    | 'excepted' // otherwise a gap, but every gapping applicable control is covered by an in-force exception
    | 'gap';

export interface RollupControl {
    status: string;
    applicability: string; // 'APPLICABLE' | 'NOT_APPLICABLE'
    /**
     * True when this control has an in-force exception: a ControlException
     * with status APPROVED AND expiresAt > now. The caller resolves this from
     * live status so reversion on expiry is automatic (no scheduling).
     */
    hasInForceException: boolean;
}

/**
 * Roll a requirement's mapped controls up to a single verdict.
 *
 * Rules (in order):
 *  - no controls           → unmapped
 *  - no APPLICABLE controls → not-applicable
 *  - worst applicable is IMPLEMENTED → implemented
 *  - otherwise it's a gap, UNLESS every applicable control that is NOT
 *    implemented is covered by an in-force exception → excepted. A single
 *    un-excepted gapping control keeps the whole requirement a gap
 *    (exceptions never paper over an un-excepted gap). EXCEPTED can never
 *    read as implemented/covered.
 */
export function rollUpRequirementVerdict(
    controls: RollupControl[],
): { verdict: RequirementVerdict; worst: string | null } {
    if (controls.length === 0) return { verdict: 'unmapped', worst: null };
    const applicable = controls.filter((c) => c.applicability === 'APPLICABLE');
    if (applicable.length === 0) return { verdict: 'not-applicable', worst: null };

    const worst = worstStatus(applicable.map((c) => c.status));
    if (worst === null) return { verdict: 'not-applicable', worst: null };
    if (isImplemented(worst)) return { verdict: 'implemented', worst };

    const gapping = applicable.filter((c) => !isImplemented(c.status));
    const allGappingExcepted =
        gapping.length > 0 && gapping.every((c) => c.hasInForceException);
    return { verdict: allGappingExcepted ? 'excepted' : 'gap', worst };
}
