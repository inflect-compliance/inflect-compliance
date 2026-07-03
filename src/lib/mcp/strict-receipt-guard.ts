/**
 * Strict-mode receipt guard seam (default OFF).
 *
 * pipelock runs in one of two postures:
 *   • "balanced" (default here) — detect + sign. Receipts are ingested + verified
 *     as evidence, but MCP tool actions are NOT blocked on their presence.
 *   • "strict" — reject an MCP tool action that arrives WITHOUT a valid verified
 *     receipt already on file.
 *
 * This is a SEAM, not an enforced gate: `PIPELOCK_STRICT_MODE` defaults to "0",
 * so `assertReceiptCoverageIfStrict` is a no-op unless an operator opts in. Wire
 * the seam into the MCP execution funnel later without changing default behaviour.
 * Keeping it off by default is deliberate — enabling strict enforcement before
 * pipelock is live in front of every agent would break the MCP surface.
 */
import { env } from '@/env';
import { forbidden } from '@/lib/errors/types';

/** True iff the operator has explicitly enabled strict receipt enforcement. */
export function isReceiptStrictModeEnabled(): boolean {
    return env.PIPELOCK_STRICT_MODE === '1';
}

/**
 * Strict-mode hook. In balanced mode (default) this returns immediately. In
 * strict mode it throws `forbidden` when the caller reports no verified receipt
 * backing the action. `hasVerifiedReceipt` is supplied by the caller (e.g. a
 * lookup keyed by run nonce) so this module stays free of DB coupling.
 */
export function assertReceiptCoverageIfStrict(hasVerifiedReceipt: boolean): void {
    if (!isReceiptStrictModeEnabled()) return;
    if (!hasVerifiedReceipt) {
        throw forbidden('pipelock strict mode: no verified action receipt on file for this agent action.');
    }
}
