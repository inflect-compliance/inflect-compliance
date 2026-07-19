/**
 * Test-plan `method` derivation — domain rule, one implementation.
 *
 * `method` (auditor-facing: MANUAL / AUTOMATED) is a DERIVED PROJECTION of
 * `automationType` (how execution actually runs: MANUAL / SCRIPT / INTEGRATION).
 * They were once editable on two separate surfaces and could disagree — a plan
 * could render "AUTOMATED" while nothing was scheduled, so the badge lied.
 *
 * This lives in `domain/` rather than in the control-test usecase because BOTH
 * the usecase layer and `TestPlanRepository` must derive it, and a repository
 * importing a usecase would invert the layer dependency. Keeping one
 * implementation here is what makes drift structurally impossible: every writer
 * of `method` in the codebase routes through this function.
 */
export function deriveMethodFromAutomationType(
    automationType: string,
): 'MANUAL' | 'AUTOMATED' {
    return automationType === 'MANUAL' ? 'MANUAL' : 'AUTOMATED';
}
