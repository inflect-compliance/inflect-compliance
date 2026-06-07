/**
 * B9 (2026-06-07) — security/quality cleanup.
 *
 * The concrete GitHub findings were 12 `js/unused-local-variable` quality
 * alerts (now removed) plus the demo-password exposure. Unused-import
 * regressions are caught by the CodeQL security-and-quality suite + eslint;
 * this ratchet locks the durable invariant the suite can't express: the
 * seed's demo password is env-overridable, with the literal only as the
 * local-dev default — and the seed-complete log no longer prints it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SEED = fs.readFileSync(path.join(ROOT, 'prisma/seed.ts'), 'utf8');

describe('B9 — seed demo password is env-overridable', () => {
    it('reads SEED_PASSWORD with a local-dev default, not a bare literal', () => {
        expect(SEED).toMatch(
            /process\.env\.SEED_PASSWORD\s*\|\|\s*'password123'/,
        );
        // the literal must not be hashed directly anymore.
        expect(SEED).not.toMatch(/bcrypt\.hash\('password123'/);
    });

    it('the seed-complete log does not print the literal password', () => {
        expect(SEED).not.toMatch(/Login with admin@acme\.com \/ password123/);
    });
});
