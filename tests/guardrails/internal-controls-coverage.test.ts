/**
 * Internal Controls library import ratchet.
 *
 * A deduped set of internal controls imported from a customer GRC export, seeded
 * as global ControlTemplates under a CUSTOM 'Internal Controls' container
 * framework + an installable pack. Each control carries an objective, success
 * criteria, and testing/audit methodology (surfaced on the control-detail
 * Overview + Tests tabs post-install) and its related-policy names. This guard
 * locks:
 *   - the fixture parses, is deduped (unique codes + titles), and every control
 *     has an objective + testing methodology;
 *   - the Control + ControlTemplate models carry the new fields (migration);
 *   - the seed wires the framework key + pack key + ICN- template codes;
 *   - install copies the new fields onto the Control;
 *   - the detail DTO exposes them so the UI can render them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel: string) => JSON.parse(read(rel));

interface Ctrl {
    code: string; title: string; objective: string; successCriteria: string;
    testingMethodology: string; relatedPolicies: string[]; category: string;
}
const fixture = readJson('prisma/fixtures/internal-controls.json') as { controls: Ctrl[] };

describe('Internal Controls fixture', () => {
    it('imports a substantial, deduped control set (>= 150)', () => {
        expect(fixture.controls.length).toBeGreaterThanOrEqual(150);
    });

    it('codes and titles are unique (deduped)', () => {
        const codes = fixture.controls.map((c) => c.code);
        const titles = fixture.controls.map((c) => c.title.trim().toLowerCase());
        expect(new Set(codes).size).toBe(codes.length);
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('every control has a code, title, objective, and testing methodology', () => {
        for (const c of fixture.controls) {
            expect(c.code).toMatch(/^ICN-\d{3}$/);
            expect(c.title.trim().length).toBeGreaterThan(0);
            expect((c.objective ?? '').trim().length).toBeGreaterThan(0);
            expect((c.testingMethodology ?? '').trim().length).toBeGreaterThan(0);
        }
    });

    it('most controls carry success criteria + a related policy (source coverage)', () => {
        const withSc = fixture.controls.filter((c) => (c.successCriteria ?? '').trim()).length;
        const withPol = fixture.controls.filter((c) => (c.relatedPolicies ?? []).length).length;
        expect(withSc).toBeGreaterThanOrEqual(fixture.controls.length - 5);
        expect(withPol).toBeGreaterThanOrEqual(Math.floor(fixture.controls.length * 0.8));
    });
});

describe('Internal Controls wiring', () => {
    const schema = read('prisma/schema/compliance.prisma');
    const seed = read('prisma/seed.ts');
    const install = read('src/app-layer/usecases/framework/install.ts');
    const dto = read('src/lib/dto/control.dto.ts');

    it('Control + ControlTemplate models carry the new fields', () => {
        for (const model of ['objective', 'successCriteria', 'testingMethodology']) {
            // present at least twice (Control + ControlTemplate)
            expect((schema.match(new RegExp(`\\b${model}\\b`, 'g')) ?? []).length).toBeGreaterThanOrEqual(2);
        }
        expect(schema).toContain('relatedPolicies');
    });

    it('a migration adds the columns', () => {
        const migs = fs.readdirSync(path.join(ROOT, 'prisma/migrations'));
        const dir = migs.find((m) => m.includes('internal_controls'));
        expect(dir).toBeTruthy();
        const sql = read(`prisma/migrations/${dir}/migration.sql`);
        expect(sql).toMatch(/ADD COLUMN.+"objective"/);
        expect(sql).toMatch(/ADD COLUMN.+"testingMethodology"/);
    });

    it('seed wires the framework + pack + ICN- templates', () => {
        expect(seed).toContain("'INTERNAL-CONTROLS'");
        expect(seed).toContain("'INTERNAL_CONTROLS'");
        expect(seed).toContain('internal-controls.json');
        expect(seed).toContain("startsWith: 'ICN-'");
    });

    it('install copies the new fields onto the Control', () => {
        expect(install).toContain('objective: tmpl.objective');
        expect(install).toContain('testingMethodology: tmpl.testingMethodology');
    });

    it('the detail DTO exposes the new fields', () => {
        for (const f of ['objective', 'successCriteria', 'testingMethodology']) {
            expect(dto).toContain(f);
        }
    });
});
