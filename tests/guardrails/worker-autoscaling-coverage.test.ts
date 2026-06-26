/**
 * Structural ratchet — KEDA worker autoscaling.
 *
 * Locks the queue-depth autoscaling wiring:
 *   - the ScaledObject template exists + declares the BullMQ redis trigger,
 *   - worker.yaml omits spec.replicas when autoscaling is on (else Helm +
 *     the HPA fight over the field),
 *   - production opts in,
 *   - the worker still drains in-flight jobs on SIGTERM (scale-down
 *     correctness — without it scale-down loses jobs to stalled-retry).
 *
 * See docs/worker-autoscaling.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8') : '';

const scaledObj = read('infra/helm/inflect/templates/worker-scaledobject.yaml');
const triggerAuth = read('infra/helm/inflect/templates/keda-redis-auth.yaml');
const workerTpl = read('infra/helm/inflect/templates/worker.yaml');
const valuesProd = read('infra/helm/inflect/values-production.yaml');
const workerScript = read('scripts/worker.ts');

describe('KEDA worker ScaledObject', () => {
    it('the ScaledObject template exists', () => {
        expect(scaledObj.length).toBeGreaterThan(0);
    });

    it('is a KEDA ScaledObject gated on autoscaling.enabled', () => {
        expect(scaledObj).toMatch(/kind:\s*ScaledObject/);
        expect(scaledObj).toMatch(/apiVersion:\s*keda\.sh\/v1alpha1/);
        expect(scaledObj).toContain('.Values.worker.autoscaling.enabled');
    });

    it('declares the BullMQ redis trigger on the wait list with a listLength', () => {
        expect(scaledObj).toMatch(/type:\s*redis/);
        expect(scaledObj).toMatch(/listName:\s*bull:.*:wait/);
        expect(scaledObj).toContain('listLength:');
    });

    it('ships a TriggerAuthentication for the redis password', () => {
        expect(triggerAuth).toMatch(/kind:\s*TriggerAuthentication/);
        expect(triggerAuth).toMatch(/parameter:\s*password/);
    });
});

describe('worker Deployment + autoscaling co-existence', () => {
    it('worker.yaml omits spec.replicas when autoscaling is enabled', () => {
        // The replicas line must be guarded by `if not ...autoscaling.enabled`.
        expect(workerTpl).toMatch(/{{-?\s*if not \.Values\.worker\.autoscaling\.enabled\s*}}/);
        // And the replicas line must live inside that guard (appears after it).
        const guardAt = workerTpl.search(/if not \.Values\.worker\.autoscaling\.enabled/);
        const replicasAt = workerTpl.search(/replicas:\s*{{\s*\.Values\.worker\.replicaCount/);
        expect(guardAt).toBeGreaterThan(-1);
        expect(replicasAt).toBeGreaterThan(guardAt);
    });

    it('production enables worker autoscaling', () => {
        // The `autoscaling:` block under `worker:` sets enabled: true.
        expect(valuesProd).toMatch(/autoscaling:\s*\n(?:\s+#.*\n)*\s+enabled:\s*true/);
    });
});

describe('graceful shutdown (scale-down correctness)', () => {
    it('worker.ts drains on SIGTERM via worker.close()', () => {
        expect(workerScript).toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
        expect(workerScript).toMatch(/worker\??\.close\(\)/);
    });
});
