/**
 * Agentic workflow engine — the declarative workflow contract (Epic Agentic 1A).
 *
 * A workflow is a DECLARATIVE sequence of steps the engine runs. It composes the
 * EXISTING MCP read/propose tools — it adds orchestration + checkpoints, NOT new
 * authority. Every PROPOSE step routes through the propose-not-commit approval
 * queue; a HUMAN_CHECKPOINT pauses the run for a human. The engine can commit
 * nothing a single MCP tool couldn't.
 *
 * Step kinds:
 *   - READ            — call an MCP read tool to gather context.
 *   - PROPOSE         — call an MCP propose tool (queues a proposal, never commits).
 *   - HUMAN_CHECKPOINT— pause the run to AWAITING_APPROVAL until a human acts.
 *   - SYNTHESIS       — reason over accumulated context to produce a summary.
 */

/** Accumulated run state. `outputs` is keyed by each step's `label`. */
export interface WorkflowContext {
    input: Record<string, unknown>;
    outputs: Record<string, unknown>;
}

export interface ReadStepDef {
    kind: 'READ';
    label: string;
    /** The MCP read tool name (e.g. 'get_compliance_posture'). */
    tool: string;
    /** Build the tool arguments from the accumulated context. */
    args?: (ctx: WorkflowContext) => Record<string, unknown>;
}

export interface ProposeStepDef {
    kind: 'PROPOSE';
    label: string;
    /** The MCP propose tool name (e.g. 'propose_controls'). */
    tool: string;
    /** Build the candidate items from the accumulated context. Empty ⇒ step skipped. */
    buildItems: (ctx: WorkflowContext) => Array<Record<string, unknown>>;
    rationale?: (ctx: WorkflowContext) => string;
}

export interface CheckpointStepDef {
    kind: 'HUMAN_CHECKPOINT';
    label: string;
}

export interface SynthesisStepDef {
    kind: 'SYNTHESIS';
    label: string;
    /** Produce a summary (and optional structured data) from the context. */
    synthesize: (ctx: WorkflowContext) => { text: string; data?: Record<string, unknown> };
}

export type WorkflowStepDef =
    | ReadStepDef
    | ProposeStepDef
    | CheckpointStepDef
    | SynthesisStepDef;

export interface WorkflowDefinition {
    key: string;
    name: string;
    description: string;
    steps: WorkflowStepDef[];
}

/**
 * Hard per-run guardrails for an autonomous multi-step agent. A run that
 * breaches any of these is FAILED (never a half-applied mess — writes are
 * proposals, so nothing is half-committed by design).
 */
export const ENGINE_CAPS = {
    /** Max steps a single run may execute. */
    MAX_STEPS: 50,
    /** Max estimated token/cost budget per run. */
    MAX_TOKENS: 200_000,
    /** Max wall-clock a run may span (across resumes), in ms. */
    WALL_CLOCK_MS: 60 * 60 * 1000,
} as const;

/** Cheap token estimate for a step's output (≈4 chars/token). */
export function estimateTokens(value: unknown): number {
    try {
        return Math.ceil(JSON.stringify(value ?? '').length / 4);
    } catch {
        return 0;
    }
}
