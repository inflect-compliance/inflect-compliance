/**
 * Guardrail — the integration provider registry is populated at runtime.
 *
 * The registry is a module-level singleton that starts empty; it is only
 * filled by the side-effecting `@/app-layer/integrations/bootstrap` import.
 * Two runtime processes depend on a populated registry:
 *
 *   • the web tier — the admin-integrations API lists providers from it and
 *     validates every connection against `registry.getProvider(...)`;
 *   • the worker — the scheduled `automation-runner` job resolves each
 *     control's `automationKey` through `registry.resolveByAutomationKey(...)`.
 *
 * If neither process imports the bootstrap, the registry is empty in
 * production: the automation engine silently no-ops and the integrations UI
 * shows nothing — even though the provider code all exists. This guardrail
 * locks the two runtime imports in place, and asserts the import actually
 * populates the registry.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('integration bootstrap — runtime wiring', () => {
    test('web instrumentation imports the integration bootstrap at startup', () => {
        const src = read('src/instrumentation.ts');
        expect(src).toMatch(
            /import\(\s*['"]@\/app-layer\/integrations\/bootstrap['"]\s*\)/,
        );
    });

    test('the BullMQ worker imports the integration bootstrap at startup', () => {
        const src = read('scripts/worker.ts');
        expect(src).toMatch(/integrations\/bootstrap/);
    });

    test('importing the bootstrap populates the provider registry', async () => {
        await import('@/app-layer/integrations/bootstrap');
        const { registry } = await import('@/app-layer/integrations/registry');
        // GitHub is the registered scheduled-check provider today; the test
        // asserts the registry is non-empty and routes github.* keys, not an
        // exhaustive provider list (new providers should not break this).
        expect(registry.listProviderIds()).toContain('github');
        expect(registry.canHandle('github.branch_protection')).toBe(true);
    });

    test('importing the bootstrap populates the integration bundle registry', async () => {
        await import('@/app-layer/integrations/bootstrap');
        const { integrationRegistry } = await import(
            '@/app-layer/integrations/registry'
        );
        expect(integrationRegistry.has('github')).toBe(true);
    });
});
