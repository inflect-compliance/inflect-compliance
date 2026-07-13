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
