/**
 * Route-level contract regression gate (companion to
 * `api-schemas.test.ts`, which snapshots component schemas).
 *
 * `api-schemas.test.ts` locks the request/response BODY shapes. This
 * file locks the per-OPERATION contract for the critical endpoint set:
 * method + path, the request body/query, the success + error
 * responses, and the `x-required-permission` / `x-rate-limit`
 * extensions — i.e. the full wire contract an external SDK / auditor
 * consumer depends on.
 *
 * Each operation is one named snapshot keyed `"<METHOD> <path>"`. A
 * field added/removed on a request component, a changed error-code
 * set, a moved permission key, or a renamed path all surface as a
 * single reviewable snapshot diff.
 *
 * On a legitimate contract change:
 *   1. `npm run openapi:generate`            # rewrites public/openapi.json
 *   2. `npx jest tests/contracts/ -u`        # updates these snapshots
 *   3. commit both — the reviewer approves the diff explicitly.
 */
import { buildOpenApiDoc } from '../../scripts/openapi-build';
import { CRITICAL_OPERATIONS, enumerateOperations } from './critical-routes';

interface OpenApiDoc {
    paths?: Record<string, Record<string, unknown>>;
}

const doc = buildOpenApiDoc({ verbose: false }) as OpenApiDoc;
const paths = doc.paths ?? {};

describe('Route contract — per-operation snapshots', () => {
    it('the built document registers path operations (sanity)', () => {
        expect(enumerateOperations(doc).length).toBeGreaterThanOrEqual(CRITICAL_OPERATIONS.length);
    });

    // One snapshot per (method, path), keyed deterministically.
    for (const opKey of [...CRITICAL_OPERATIONS].sort()) {
        it(`operation: ${opKey}`, () => {
            const [method, path] = opKey.split(' ');
            const op = paths[path]?.[method.toLowerCase()];
            // Presence is asserted by the coverage guard; here we want a
            // clear failure if a listed op is missing from the build.
            expect(op).toBeDefined();
            expect(JSON.stringify(op, null, 2)).toMatchSnapshot();
        });
    }
});
