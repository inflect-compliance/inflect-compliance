/**
 * EI-3 ratchet — Entra group → role enforcement must stay wired at sign-in:
 * the sync module exists, OWNER stays immune, the gate consumes
 * `enforceGroupGate`, membership is only UPDATED (never created), and the jwt
 * callback delegates to it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('EI-3 Entra group → role enforcement', () => {
    const sync = () => read('src/lib/auth/entra-group-sync.ts');

    it('the sync module exposes the enforcement + token-application functions', () => {
        expect(exists('src/lib/auth/entra-group-sync.ts')).toBe(true);
        expect(sync()).toMatch(/export async function syncEntraMembershipRole/);
        expect(sync()).toMatch(/export function applyEntraSyncToToken/);
    });

    it('OWNER is immune to sync + gate', () => {
        expect(sync()).toMatch(/owner_immune/);
        expect(sync()).toMatch(/=== 'OWNER'/);
    });

    it('the gate consumes enforceGroupGate', () => {
        expect(sync()).toMatch(/enforceGroupGate/);
        expect(sync()).toMatch(/gateDenied/);
    });

    it('membership is only UPDATED, never created (no-auto-join stays intact)', () => {
        const src = sync();
        expect(src).toMatch(/tenantMembership\.update/);
        expect(src).not.toMatch(/tenantMembership\.(create|upsert|createMany)/);
    });

    it('the role change is audited as MEMBER_ROLE_CHANGED via the entra_group_sync source', () => {
        expect(sync()).toMatch(/MEMBER_ROLE_CHANGED/);
        expect(sync()).toMatch(/entra_group_sync/);
    });

    it('the jwt callback delegates to the sync module', () => {
        const auth = read('src/auth.ts');
        expect(auth).toMatch(/syncEntraMembershipRole/);
        expect(auth).toMatch(/applyEntraSyncToToken/);
    });

    it('the role-sync metric recorder exists', () => {
        expect(read('src/lib/observability/metrics.ts')).toMatch(/export function recordEntraRoleSync/);
    });
});
