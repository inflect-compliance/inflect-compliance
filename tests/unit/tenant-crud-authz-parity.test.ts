/**
 * Parity proof for the tenant-CRUD authz enforcement.
 *
 * The five tenant entities (risks, controls, tasks, policies, vendors)
 * moved from coarse usecase-layer gating (`assertCanRead/Write`, which
 * read `computePermissions(role).canRead/canWrite`) to route-boundary
 * `requirePermission('<entity>.<action>')` (which reads the granular
 * `getPermissionsForRole(role).<entity>.{view,create,edit}`).
 *
 * For that swap to be SAFE it must not change WHO is allowed — only
 * the denial shape. This test locks that invariant for every role:
 *   - `.view`  must equal coarse `canRead`  (GET parity)
 *   - `.create`/`.edit` must equal coarse `canWrite` (mutation parity)
 *
 * If a future role-table edit breaks the equivalence (e.g. grants an
 * AUDITOR `risks.create` while leaving `canWrite` false, or vice
 * versa), this fails — flagging that the route gate and the historical
 * usecase gate have diverged.
 */
import type { Role } from '@prisma/client';
import { getPermissionsForRole } from '@/lib/permissions';
import { computePermissions } from '@/lib/tenant-context';

const ROLES: Role[] = ['OWNER', 'ADMIN', 'EDITOR', 'AUDITOR', 'READER'];
const ENTITIES = ['risks', 'controls', 'tasks', 'policies', 'vendors'] as const;

describe('tenant-CRUD authz parity (granular keys ≡ coarse canRead/canWrite)', () => {
    for (const role of ROLES) {
        const coarse = computePermissions(role);
        const granular = getPermissionsForRole(role);

        for (const entity of ENTITIES) {
            const perms = granular[entity];

            it(`${role}/${entity}: .view === canRead (${coarse.canRead})`, () => {
                expect(perms.view).toBe(coarse.canRead);
            });

            it(`${role}/${entity}: .create === canWrite (${coarse.canWrite})`, () => {
                expect(perms.create).toBe(coarse.canWrite);
            });

            it(`${role}/${entity}: .edit === canWrite (${coarse.canWrite})`, () => {
                expect(perms.edit).toBe(coarse.canWrite);
            });
        }
    }
});
