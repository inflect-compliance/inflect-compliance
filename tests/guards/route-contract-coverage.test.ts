/**
 * Coverage guard for the route-level contract (CRITICAL_SET).
 *
 * Asserts the built OpenAPI document's operation set EXACTLY equals
 * `CRITICAL_OPERATIONS`:
 *   - a new critical route shipped without a path registration → the
 *     op is missing → CI fails until it's registered + snapshotted;
 *   - a path registered but not declared critical → extra op → CI
 *     fails, keeping the published surface curated.
 *
 * Pairs with `tests/contracts/route-contracts.test.ts` (the snapshots
 * themselves) the way `api-permission-coverage` pairs with the
 * per-schema snapshots.
 */
import { buildOpenApiDoc } from '../../scripts/openapi-build';
import { CRITICAL_OPERATIONS, enumerateOperations, enumerateNonStubOperations } from '../contracts/critical-routes';

describe('route contract coverage', () => {
    const doc = buildOpenApiDoc({ verbose: false }) as { paths?: Record<string, Record<string, unknown>> };
    // All operations (critical + route-walker stubs).
    const actual = enumerateOperations(doc);
    // Only the richly-documented surface (stubs excluded).
    const richlyDocumented = enumerateNonStubOperations(doc);
    const expected = [...CRITICAL_OPERATIONS].sort();

    it('every CRITICAL_SET operation is registered as a path in the OpenAPI doc', () => {
        const missing = expected.filter((op) => !actual.includes(op));
        expect(missing).toEqual([]);
    });

    it('no NON-STUB operation is registered outside the curated CRITICAL_SET', () => {
        // The route-walker publishes `x-stub` operations for every other
        // route so the spec is complete; only NON-stub ops must stay
        // curated. A richly-documented op outside CRITICAL_SET fails CI.
        const extra = richlyDocumented.filter((op) => !expected.includes(op));
        expect(extra).toEqual([]);
    });

    it('every CRITICAL_SET operation is richly documented (not a stub)', () => {
        const stubbed = expected.filter((op) => !richlyDocumented.includes(op));
        expect(stubbed).toEqual([]);
    });

    it('uses OpenAPI {param} templating, never Next [param]', () => {
        const bad = expected.filter((op) => op.includes('[') || op.includes(']'));
        expect(bad).toEqual([]);
    });
});
