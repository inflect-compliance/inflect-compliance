/**
 * Regression lock for the tenant-CRUD authorization enforcement.
 *
 * The six tenant entity list+detail routes (risks, controls, tasks,
 * assets, policies, vendors) historically authorized ONLY via the
 * usecase-layer `assertCanRead/Write` helpers. They now ALSO gate at
 * the route boundary with `requirePermission('<entity>.<action>')`,
 * so denials emit an `AUTHZ_DENIED` audit row and the granular key is
 * the documented + enforced contract (mirrors the `x-required-permission`
 * in the route-contract snapshots).
 *
 * This guard fails CI if any of those gates is removed or its key
 * changed. It is deliberately file-scoped (not a PRIVILEGED_ROOTS
 * entry in api-permission-coverage.test.ts) because those entity
 * roots contain dozens of sub-routes that authorize at the usecase
 * layer and are NOT in scope here — a root-prefix rule would wrongly
 * demand gating all of them.
 *
 * Parity note: granular `.view` is true for every role and
 * `.create`/`.edit` are true for OWNER/ADMIN/EDITOR (= the coarse
 * `canWrite` set), so wiring these keys preserves WHO is allowed; only
 * the denial shape changes. See `computePermissions` + the role table
 * in `src/lib/permissions.ts`.
 */
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.resolve(__dirname, '../../src/app/api/t/[tenantSlug]');

interface RouteSpec {
    file: string;
    /** method → required permission key */
    gates: Record<string, string>;
}

const SPECS: RouteSpec[] = [
    { file: 'risks/route.ts', gates: { GET: 'risks.view', POST: 'risks.create' } },
    { file: 'risks/[id]/route.ts', gates: { GET: 'risks.view', PUT: 'risks.edit', DELETE: 'risks.edit' } },
    { file: 'controls/route.ts', gates: { GET: 'controls.view', POST: 'controls.create' } },
    { file: 'controls/[controlId]/route.ts', gates: { GET: 'controls.view', PATCH: 'controls.edit' } },
    { file: 'tasks/route.ts', gates: { GET: 'tasks.view', POST: 'tasks.create' } },
    { file: 'tasks/[taskId]/route.ts', gates: { GET: 'tasks.view', PATCH: 'tasks.edit', DELETE: 'tasks.edit' } },
    { file: 'assets/route.ts', gates: { GET: 'assets.view', POST: 'assets.create' } },
    { file: 'assets/[id]/route.ts', gates: { GET: 'assets.view', PUT: 'assets.edit', DELETE: 'assets.edit' } },
    { file: 'policies/route.ts', gates: { GET: 'policies.view', POST: 'policies.create' } },
    { file: 'policies/[id]/route.ts', gates: { GET: 'policies.view', PATCH: 'policies.edit' } },
    { file: 'vendors/route.ts', gates: { GET: 'vendors.view', POST: 'vendors.create' } },
    { file: 'vendors/[vendorId]/route.ts', gates: { GET: 'vendors.view', PATCH: 'vendors.edit' } },
];

describe('tenant-CRUD authz enforcement', () => {
    for (const spec of SPECS) {
        describe(spec.file, () => {
            const full = path.join(API_ROOT, spec.file);
            const src = fs.readFileSync(full, 'utf-8');

            it('imports requirePermission', () => {
                expect(/from '@\/lib\/security\/permission-middleware'/.test(src)).toBe(true);
                expect(/\brequirePermission\b/.test(src)).toBe(true);
            });

            for (const [method, key] of Object.entries(spec.gates)) {
                it(`${method} is gated by requirePermission('${key}')`, () => {
                    // export const <METHOD> = withApiErrorHandling(requirePermission<...>('<key>', …
                    const re = new RegExp(
                        `export const ${method}\\b[\\s\\S]{0,160}?requirePermission(?:<[^>]*>)?\\(\\s*'${key.replace('.', '\\.')}'`,
                    );
                    expect(re.test(src)).toBe(true);
                });
            }
        });
    }
});
