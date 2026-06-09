/**
 * SP-F3 ratchet — Word (.docx) policy sync (pull-authoritative).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('SP-F3 DOCX policy sync', () => {
    it('the docx module converts via mammoth + sanitises', () => {
        expect(exists('src/app-layer/integrations/providers/sharepoint/docx.ts')).toBe(true);
        const src = read('src/app-layer/integrations/providers/sharepoint/docx.ts');
        expect(src).toMatch(/mammoth/);
        expect(src).toMatch(/export function isDocxItem/);
        expect(src).toMatch(/export async function docxToPolicyHtml/);
        expect(src).toMatch(/sanitize/i);
    });

    it('pull converts Word → HTML, push is disabled for Word-linked policies', () => {
        const src = read('src/app-layer/usecases/policy-sharepoint-sync.ts');
        expect(src).toMatch(/isDocxItem/);
        expect(src).toMatch(/docxToPolicyHtml/);
        // push bails for docx-linked policies (SharePoint-authoritative).
        expect(src).toMatch(/Word-linked policy is SharePoint-authoritative/);
    });

    it('mammoth is a production dependency', () => {
        const pkg = JSON.parse(read('package.json'));
        expect(pkg.dependencies?.mammoth).toBeDefined();
    });
});
