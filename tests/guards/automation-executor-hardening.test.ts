/**
 * PR-D — executor hardening ratchet. Keeps the safety guards present so a
 * refactor can't silently drop them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const EXEC = read('src/app-layer/automation/action-executor.ts');

describe('executor hardening', () => {
    it('UPDATE_STATUS enforces a transition allowlist', () => {
        expect(EXEC).toMatch(/STATUS_ALLOWLIST/);
        expect(EXEC).toMatch(/Illegal .* status/);
    });

    it('WEBHOOK routes the tenant URL through safeFetch (SSRF guard + DNS-rebinding re-check + IP-pin)', () => {
        // The guard is now centralised in webhook-safety.safeFetch, which runs
        // assertPublicAddress (https-only + private/metadata block + DNS re-check
        // of every resolved address + connection IP-pin) before connecting.
        expect(EXEC).toMatch(/safeFetch\(cfg\.url/);
        expect(EXEC).toMatch(/from '\.\/webhook-safety'/);
        // no bare fetch on the tenant-supplied URL
        expect(EXEC).not.toMatch(/await fetch\(cfg\.url/);
    });

    it('CREATE_TASK dedupes before creating', () => {
        expect(EXEC).toMatch(/dedupeKey/);
        expect(EXEC).toMatch(/task\.findFirst/);
    });

    it('NOTIFY_USER respects the tenant notification kill-switch', () => {
        expect(EXEC).toMatch(/isNotificationsEnabled/);
    });
});
