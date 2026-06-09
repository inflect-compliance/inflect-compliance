/**
 * SP-F1 ratchet — per-policy connection + folder-select export targeting.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('SP-F1 connection + folder targeting', () => {
    it('Policy carries spConnectionId (+ migration)', () => {
        expect(read('prisma/schema/compliance.prisma')).toMatch(/spConnectionId\s+String\?/);
        expect(exists('prisma/migrations/20260609180000_policy_sp_connection_id/migration.sql')).toBe(true);
    });

    it('the sync usecase resolves the policy-stored connection on push/pull/conflict', () => {
        const src = read('src/app-layer/usecases/policy-sharepoint-sync.ts');
        // link stores it, and the other paths pass it to resolveClient.
        expect(src).toMatch(/spConnectionId: input\.connectionId/);
        expect((src.match(/resolveClient\(ctx, policy\.spConnectionId/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });

    it('the file picker supports folder-select, and the export button uses it', () => {
        const picker = read('src/components/integrations/sharepoint/SharePointFilePicker.tsx');
        expect(picker).toMatch(/folderSelect/);
        expect(picker).toMatch(/onConfirmFolder/);
        expect(read('src/app/t/[tenantSlug]/(app)/audits/packs/[packId]/SharePointExportButton.tsx')).toMatch(/folderSelect/);
    });
});
