/**
 * IC ORIGINAL gap-fill policy-template ratchet.
 *
 * The bulk of the policy-template library is the ciso-toolkit (MIT) + imported
 * sets (guarded elsewhere). This locks the small set of ORIGINAL, IC-authored
 * templates that fill the topics genuinely absent from those sets — threat &
 * vulnerability management, corporate governance, data classification &
 * handling, MDM/BYOD — and their framework mapping. It asserts:
 *   - all four exist with the 5 canonical house-style sections + real content;
 *   - the ORIGINALITY/LICENSE header discipline (no CC-BY-SA source, no
 *     `{{variable}}` template tokens that would betray a verbatim paste);
 *   - the seed loads the fixture;
 *   - every framework code mapped to the four resolves to a REAL requirement.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel: string) => JSON.parse(read(rel));

const GAPS = 'prisma/fixtures/policy-templates-original-gaps.json';
const MAP = 'prisma/fixtures/policy-template-framework-map.json';

const EXPECTED_REFS = [
    'ORIG-VULN-MGMT',
    'ORIG-GOVERNANCE',
    'ORIG-DATA-CLASSIFICATION',
    'ORIG-MDM-BYOD',
] as const;

const CANONICAL_SECTIONS = [
    '## 1. Purpose',
    '## 2. Scope',
    '## 3. Policy Statements',
    '## 4. Responsibilities',
    '## 5. Review',
];

interface Template { externalRef: string; title: string; category: string; contentType: string; contentText: string; tags: string; source: string }
const fixture = readJson(GAPS) as { _meta: { note?: string }; templates: Template[] };

describe('IC original gap-fill policy templates', () => {
    it('vendors exactly the four original gap templates with required fields', () => {
        const refs = fixture.templates.map((t) => t.externalRef).sort();
        expect(refs).toEqual([...EXPECTED_REFS].sort());
        for (const t of fixture.templates) {
            for (const f of ['title', 'category', 'contentText', 'tags', 'source'] as const) {
                expect(t[f]).toBeTruthy();
            }
            expect(t.contentType).toBe('MARKDOWN');
            expect(t.source).toBe('IC Original');
        }
    });

    it('every template has all five canonical house-style sections + real content', () => {
        for (const t of fixture.templates) {
            for (const s of CANONICAL_SECTIONS) {
                expect(t.contentText.includes(s)).toBe(true);
            }
            // Substantive, not a stub.
            expect(t.contentText.length).toBeGreaterThan(600);
            expect(t.contentText.startsWith('# ')).toBe(true);
        }
    });

    it('retains ORIGINAL-content discipline: no CC-BY-SA source, no {{tmpl}} tokens', () => {
        expect(fixture._meta.note ?? '').toMatch(/ORIGINAL content/i);
        for (const t of fixture.templates) {
            // A cheap tripwire against an accidental verbatim toolkit paste.
            expect(t.contentText).not.toMatch(/\{\{/);
            expect(t.contentText.toLowerCase()).not.toContain('cc-by-sa');
        }
    });

    it('is loaded by the seed (reaches tenants via the normal PolicyTemplate path)', () => {
        const seed = read('prisma/seed.ts');
        expect(seed).toContain('policy-templates-original-gaps.json');
        expect(seed).toContain('policyTemplate');
    });

    it('every gap template is mapped, and every mapped code resolves to a real requirement', () => {
        const map = readJson(MAP) as { mappings: Record<string, { iso27001?: { code: string }[]; nis2?: { code: string }[] }> };
        const isoCodes = new Set((readJson('prisma/fixtures/iso27001_2022_annexA.json') as { key: string }[]).map((r) => r.key));
        const nis2Codes = new Set((readJson('prisma/fixtures/nis2_requirements.json') as { key: string }[]).map((r) => r.key));
        const dangling: string[] = [];
        for (const ref of EXPECTED_REFS) {
            const m = map.mappings[ref];
            expect(m).toBeTruthy();
            const total = (m.iso27001?.length ?? 0) + (m.nis2?.length ?? 0);
            expect(total).toBeGreaterThan(0);
            for (const e of m.iso27001 ?? []) if (!isoCodes.has(e.code)) dangling.push(`${ref} iso:${e.code}`);
            for (const e of m.nis2 ?? []) if (!nis2Codes.has(e.code)) dangling.push(`${ref} nis2:${e.code}`);
        }
        expect(dangling).toEqual([]);
    });
});
