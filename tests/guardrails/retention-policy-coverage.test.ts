/**
 * Structural ratchet — data-retention policy coverage.
 *
 * Enforces that docs/data-retention.md stays an HONEST, COMPLETE map of
 * the schema:
 *   - the doc exists,
 *   - every Prisma model appears as a row in the inventory table (a new
 *     model can't be added without classifying its retention),
 *   - the "Open questions" section is non-empty (honesty guard — the doc
 *     must not pretend every retention number is decided),
 *   - the cleanup-job inventory names every retention function exported
 *     from jobs/retention*.ts and jobs/data-lifecycle.ts.
 *
 * See docs/data-retention.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const DOC = path.join(ROOT, 'docs/data-retention.md');
const SCHEMA_DIR = path.join(ROOT, 'prisma/schema');

function read(p: string): string {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

/** Every `model X { ... }` name across the multi-file schema. */
function allModelNames(): string[] {
    const names: string[] = [];
    for (const f of fs.readdirSync(SCHEMA_DIR)) {
        if (!f.endsWith('.prisma')) continue;
        const txt = fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf-8');
        for (const m of txt.matchAll(/^model\s+(\w+)\s*\{/gm)) names.push(m[1]);
    }
    return names;
}

/** Retention functions exported from the cleanup-job sources. */
function retentionFunctions(): string[] {
    const files = [
        'src/app-layer/jobs/retention.ts',
        'src/app-layer/jobs/retention-notifications.ts',
        'src/app-layer/jobs/data-lifecycle.ts',
    ];
    const fns: string[] = [];
    for (const rel of files) {
        const txt = read(path.join(ROOT, rel));
        for (const m of txt.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) fns.push(m[1]);
    }
    return fns;
}

const doc = read(DOC);

describe('data-retention policy doc', () => {
    it('exists', () => {
        expect(doc.length).toBeGreaterThan(0);
    });

    it('lists every Prisma model in the inventory table', () => {
        const models = allModelNames();
        expect(models.length).toBeGreaterThanOrEqual(139);
        // Each model must appear as a table-row anchor: `| `Model` |`.
        const missing = models.filter((m) => !doc.includes(`| \`${m}\` |`));
        expect(missing).toEqual([]);
    });

    it('has a non-empty Open questions section (honesty guard)', () => {
        const m = doc.match(/##\s+Open questions([\s\S]*?)(?:\n##\s|\n#\s|$)/);
        expect(m).not.toBeNull();
        const body = (m?.[1] ?? '').trim();
        // Must contain at least a few enumerated questions, not just a heading.
        const numbered = body.match(/^\d+\.\s+\*\*/gm) ?? [];
        expect(numbered.length).toBeGreaterThanOrEqual(3);
    });

    it('names every retention cleanup function in the job-inventory', () => {
        const fns = retentionFunctions();
        // Sanity: we actually found the known functions.
        expect(fns).toEqual(
            expect.arrayContaining([
                'runEvidenceRetentionSweep',
                'purgeSoftDeletedOlderThan',
                'purgeExpiredEvidenceOlderThan',
                'runRetentionSweep',
            ]),
        );
        const missing = fns.filter((fn) => !doc.includes(fn));
        expect(missing).toEqual([]);
    });
});
