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

    it('the UPDATE_STATUS allowlist is a single shared source (executor + builder)', () => {
        // PR-E — the builder's entity/status DROPDOWNS and the executor's
        // enforcement both read UPDATE_STATUS_TARGETS, so they can never drift.
        expect(EXEC).toMatch(/UPDATE_STATUS_TARGETS/);
        expect(EXEC).toMatch(/from '@\/lib\/automation\/status-allowlist'/);
        const modal = read('src/components/processes/RuleBuilderModal.tsx');
        expect(modal).toMatch(/UPDATE_STATUS_TARGETS/);
        // No free-text status Input for UPDATE_STATUS — it's a Combobox now.
        expect(modal).toMatch(/statusValueOptions/);
        expect(modal).toMatch(/entityTypeOptions/);
    });
});
