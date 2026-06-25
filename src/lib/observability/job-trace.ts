/**
 * Job trace propagation — thread the W3C distributed-trace context
 * from the web tier into BullMQ jobs and back out in the worker.
 *
 * The flow:
 *
 *   HTTP handler span ──(enqueue ▸ propagation.inject)──▶ job payload
 *        │                                                    │
 *        │                                       Redis (BullMQ row)
 *        ▼                                                    │
 *   ◀── execute span (propagation.extract ▸ context.with) ◀──┘
 *
 * The web tier injects the active context into a carrier and stashes
 * it on the job payload under {@link OTEL_CARRIER_KEY}. The worker
 * extracts that carrier, activates it, and starts the job-execution
 * span inside it — so the execution span (and every usecase /
 * repository span nested under it) links back to the originating HTTP
 * request as one continuous trace in Tempo.
 *
 * This module is the single seam for that mechanism: `queue.ts`
 * injects, `scripts/worker.ts` runs jobs through
 * {@link runJobInTraceContext}, and the integration test exercises
 * both halves without a live Redis.
 *
 * SAFETY: every span helper is a no-op-safe wrapper over the global
 * tracer, so it works whether or not OTel is initialized (dev/test
 * get the noop tracer; the carrier is still attached but inert).
 *
 * @module lib/observability/job-trace
 */
import {
    propagation,
    trace,
    context as otelContext,
    SpanStatusCode,
    type Span,
    type Attributes,
} from '@opentelemetry/api';

/**
 * Sentinel payload key under which the W3C trace carrier
 * (`traceparent` + `tracestate`) rides on a BullMQ job payload.
 *
 * The double-underscore namespace guarantees it can never collide
 * with a typed `JobPayload<T>` field, and executors — which read only
 * their own payload shape — ignore it. The worker strips it via
 * {@link stripTraceCarrier} before handing the payload to an executor.
 *
 * REVIEW SENTINEL: this key is internal observability plumbing, not
 * business data — never log it and never ship it in audit-stream
 * events. It is not PII, but it does not belong in the audit trail.
 */
export const OTEL_CARRIER_KEY = '__otel_carrier' as const;

/** Tracer name for worker-side job-execution spans. */
const WORKER_TRACER = 'inflect.worker';

/**
 * Capture the currently-active trace context into a fresh W3C
 * carrier (`{ traceparent, tracestate? }`). Returns an empty object
 * when no context is active or OTel is disabled.
 */
export function captureTraceCarrier(): Record<string, string> {
    const carrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), carrier);
    return carrier;
}

/**
 * Read the trace carrier off a job payload. Returns an empty object
 * (a valid no-parent carrier) when the sentinel is absent — e.g. a
 * job enqueued before this feature shipped, or by a path that does
 * not go through {@link enqueue}.
 */
export function readTraceCarrier(data: unknown): Record<string, string> {
    if (data && typeof data === 'object' && OTEL_CARRIER_KEY in data) {
        const carrier = (data as Record<string, unknown>)[OTEL_CARRIER_KEY];
        if (carrier && typeof carrier === 'object') {
            return carrier as Record<string, string>;
        }
    }
    return {};
}

/**
 * Return a shallow copy of the job payload with the carrier sentinel
 * removed, so executors receive only their typed `JobPayload<T>`
 * shape and the carrier never reaches business logic or logs.
 */
export function stripTraceCarrier<T extends Record<string, unknown>>(
    data: T,
): Omit<T, typeof OTEL_CARRIER_KEY> {
    if (!data || typeof data !== 'object' || !(OTEL_CARRIER_KEY in data)) {
        return data;
    }
    const clone = { ...data };
    delete clone[OTEL_CARRIER_KEY];
    return clone;
}

/**
 * Execute `fn` inside a span that is a child of the originating
 * (web-tier) span carried in `carrier`.
 *
 * Extracts the W3C context from the carrier, activates it, and starts
 * an ACTIVE span — so any usecase / repository spans created inside
 * `fn` nest under it, and the whole subtree links back to the HTTP
 * request that enqueued the job.
 *
 * The span status is set to OK on success and ERROR (with the
 * exception recorded) when `fn` throws; the error is always
 * re-thrown so BullMQ's retry semantics are preserved.
 */
export async function runJobInTraceContext<T>(
    carrier: Record<string, string>,
    spanName: string,
    attributes: Attributes,
    fn: (span: Span) => Promise<T>,
): Promise<T> {
    const parentCtx = propagation.extract(otelContext.active(), carrier);
    const tracer = trace.getTracer(WORKER_TRACER);

    return otelContext.with(parentCtx, () =>
        tracer.startActiveSpan(spanName, { attributes }, async (span: Span) => {
            try {
                const result = await fn(span);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (err) {
                if (err instanceof Error) {
                    span.recordException(err);
                }
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err instanceof Error ? err.message : String(err),
                });
                throw err;
            } finally {
                span.end();
            }
        }),
    );
}
