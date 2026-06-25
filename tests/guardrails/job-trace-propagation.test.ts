/**
 * Structural ratchet — W3C traceparent propagation from the web tier
 * into the BullMQ worker (feat(observability): job-trace propagation).
 *
 * Locks the wiring that threads a distributed trace through an async
 * job so a slow HTTP request and its downstream worker execution show
 * as ONE trace in Tempo. A refactor that drops any of the four moving
 * parts — inject at enqueue, OTel init in the worker, extract+activate
 * on pickup, or the single-source carrier key — fails CI here.
 *
 * See docs/observability/05-job-tracing.md and
 * docs/implementation-notes/2026-06-25-job-trace-propagation.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const QUEUE_TS = path.join(ROOT, 'src/app-layer/jobs/queue.ts');
const WORKER_TS = path.join(ROOT, 'scripts/worker.ts');
const JOB_TRACE_TS = path.join(ROOT, 'src/lib/observability/job-trace.ts');

function read(p: string): string {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

describe('job-trace propagation — structural wiring', () => {
    const queue = read(QUEUE_TS);
    const worker = read(WORKER_TS);
    const jobTrace = read(JOB_TRACE_TS);

    describe('src/lib/observability/job-trace.ts — the single seam', () => {
        it('exists', () => {
            expect(jobTrace.length).toBeGreaterThan(0);
        });

        it('defines the carrier sentinel as the literal __otel_carrier (single source of truth)', () => {
            expect(jobTrace).toMatch(/OTEL_CARRIER_KEY\s*=\s*['"]__otel_carrier['"]/);
        });

        it('extracts the W3C context and activates it before running the job', () => {
            expect(jobTrace).toMatch(/propagation\.extract\(/);
            // context is imported `as otelContext`; activation via context.with
            expect(jobTrace).toMatch(/otelContext\.with\(/);
        });

        it('starts the job-execution span as an ACTIVE span (so nested spans link under it)', () => {
            expect(jobTrace).toMatch(/runJobInTraceContext/);
            expect(jobTrace).toMatch(/startActiveSpan\(/);
        });
    });

    describe('src/app-layer/jobs/queue.ts — enqueue injects the carrier', () => {
        it('injects the active trace context before queue.add', () => {
            expect(queue).toMatch(/propagation\.inject\(/);
            const injectAt = queue.indexOf('propagation.inject');
            const addAt = queue.indexOf('queue.add(');
            expect(injectAt).toBeGreaterThan(-1);
            expect(addAt).toBeGreaterThan(-1);
            expect(injectAt).toBeLessThan(addAt);
        });

        it('starts an `enqueue` span around the add', () => {
            expect(queue).toMatch(/startActiveSpan\(\s*[`'"]enqueue /);
        });

        it('attaches the carrier under the shared OTEL_CARRIER_KEY (not a hand-spelled string)', () => {
            expect(queue).toMatch(/OTEL_CARRIER_KEY/);
            expect(queue).toMatch(/\[OTEL_CARRIER_KEY\]\s*:/);
            // The literal must NOT be re-spelled here — the key lives in
            // job-trace.ts. (Allow it only inside the import line.)
            const nonImport = queue.replace(/^import .*$/gm, '');
            expect(nonImport).not.toContain('__otel_carrier');
        });

        it('tags the enqueue span with canonical messaging.* attributes', () => {
            expect(queue).toMatch(/['"]messaging\.system['"]\s*:\s*['"]bullmq['"]/);
            expect(queue).toMatch(/['"]messaging\.destination\.name['"]/);
        });
    });

    describe('scripts/worker.ts — initializes OTel and runs jobs in trace context', () => {
        it('imports the OTel init + the job-trace seam', () => {
            expect(worker).toMatch(/initTelemetry/);
            expect(worker).toMatch(/runJobInTraceContext/);
            expect(worker).toMatch(/readTraceCarrier/);
            expect(worker).toMatch(/stripTraceCarrier/);
        });

        it('calls initTelemetry() BEFORE the first new Worker(...)', () => {
            const initAt = worker.indexOf('await initTelemetry()');
            // Match the actual construction (`worker = new Worker(`), not the
            // phrase "new Worker(...)" in the header comment.
            const workerAt = worker.indexOf('worker = new Worker(');
            expect(initAt).toBeGreaterThan(-1);
            expect(workerAt).toBeGreaterThan(-1);
            expect(initAt).toBeLessThan(workerAt);
        });

        it('runs the executor inside runJobInTraceContext and strips the carrier first', () => {
            expect(worker).toMatch(/runJobInTraceContext\(/);
            expect(worker).toMatch(/stripTraceCarrier\(job\.data/);
            // The executor must receive the stripped payload, never job.data raw.
            expect(worker).not.toMatch(/executorRegistry\.execute\(jobName,\s*job\.data/);
        });

        it('drains OTel on graceful shutdown', () => {
            expect(worker).toMatch(/shutdownTelemetry\(/);
        });
    });

    it('the carrier key is single-sourced: both queue.ts and worker.ts reach it through job-trace.ts', () => {
        expect(queue).toMatch(/from '@\/lib\/observability\/job-trace'/);
        expect(worker).toMatch(/observability\/job-trace/);
    });
});
