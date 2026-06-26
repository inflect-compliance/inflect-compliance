/**
 * Structural ratchet — change-management policy doc.
 *
 * Keeps docs/change-management-policy.md structurally complete + honest:
 *   - the file exists,
 *   - all nine H2 sections are present (Scope through Open policy questions),
 *   - the approval matrix is a real (non-empty) markdown table,
 *   - it cross-links to its operational twin (deployment.md) + the on-call
 *     runbook (incident-response.md),
 *   - the "Open policy questions" section is non-empty (honesty guard — a
 *     change policy that claims every question is answered is a smell).
 *
 * See docs/change-management-policy.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const DOC = path.join(ROOT, 'docs/change-management-policy.md');
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf-8') : '';

const REQUIRED_H2 = [
    '## Scope',
    '## Change classes',
    '## Approval matrix',
    '## Audit trail',
    '## Emergency change procedure',
    '## Rollback policy',
    '## What "production-affecting change" excludes',
    '## On-call coverage',
    '## Open policy questions',
];

/** Body of a `## <heading>` section up to the next H2 (or EOF). */
function section(heading: string): string {
    const re = new RegExp(`${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n([\\s\\S]*?)(?:\\n##\\s|$)`);
    return doc.match(re)?.[1] ?? '';
}

describe('change-management-policy doc', () => {
    it('exists', () => {
        expect(doc.length).toBeGreaterThan(0);
    });

    it('has all nine canonical H2 sections', () => {
        const missing = REQUIRED_H2.filter((h) => !doc.includes(`\n${h}\n`));
        expect(missing).toEqual([]);
    });

    it('the approval matrix is a non-empty markdown table', () => {
        const body = section('## Approval matrix');
        // A markdown table: a header separator row + at least one data row.
        expect(/\|\s*-+\s*\|/.test(body)).toBe(true);
        const dataRows = body
            .split('\n')
            .filter((l) => l.trim().startsWith('|') && !/^\|[\s|:-]+\|?$/.test(l.trim()));
        // header row + ≥3 change-type rows.
        expect(dataRows.length).toBeGreaterThanOrEqual(4);
    });

    it('cross-links to deployment.md and incident-response.md', () => {
        expect(doc).toMatch(/deployment\.md/);
        expect(doc).toMatch(/incident-response\.md/);
    });

    it('has a non-empty Open policy questions section (honesty guard)', () => {
        const body = section('## Open policy questions').trim();
        // At least three bullet questions.
        const bullets = body.match(/^- \*\*/gm) ?? [];
        expect(bullets.length).toBeGreaterThanOrEqual(3);
    });
});
