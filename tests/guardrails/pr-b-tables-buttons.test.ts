/**
 * PR-B — Table & button hygiene ratchet.
 *
 *   1. Tests rollup table splits Name + Status into separate
 *      columns (no longer stacked inside one cell).
 *
 *   2. Risk gains a `key` column ('RSK-N') generated atomically
 *      via `RiskKeySequence.upsert`. The Risk list page leads
 *      with the new Code column.
 *
 *   3. The shared `<Button>` renders an icon-balance ghost when an
 *      icon AND a content label are both present — pulls the
 *      text to the geometric centre of the button so "+ Create X"
 *      reads as a balanced control.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('PR-B — table & button hygiene', () => {
    describe('Tests rollup: Name + Status as separate columns', () => {
        const src = read('src/app/t/[tenantSlug]/(app)/tests/page.tsx');

        it('first column is `id: "name"` (canonical Name)', () => {
            // Locate the planColumns construction and confirm the
            // FIRST id key inside that block is "name". Comments
            // between the array open and the first object literal
            // make a positional regex brittle; instead the first
            // `id: ...` after `createColumns<TestPlanSummary>([` is
            // the leading column.
            const start = src.indexOf('createColumns<TestPlanSummary>([');
            expect(start).toBeGreaterThan(0);
            const slice = src.slice(start, start + 2000);
            const firstIdMatch = slice.match(/id:\s*['"]([^'"]+)['"]/);
            expect(firstIdMatch).not.toBeNull();
            expect(firstIdMatch![1]).toBe('name');
        });

        it('Status is its own column with `id: "status"`', () => {
            expect(src).toMatch(
                /id:\s*['"]status['"],\s*header:\s*['"]Status['"]/,
            );
        });

        it('Status is positioned immediately after Name (not at end)', () => {
            // Find both column ids and confirm Name comes before Status
            // AND Status comes before Control.
            const nameIdx = src.indexOf("id: 'name'");
            const statusIdx = src.indexOf("id: 'status'");
            const controlIdx = src.indexOf("id: 'control'");
            expect(nameIdx).toBeGreaterThan(0);
            expect(statusIdx).toBeGreaterThan(nameIdx);
            expect(controlIdx).toBeGreaterThan(statusIdx);
        });

        it('Name cell no longer stacks the status badge underneath', () => {
            // Pre-PR-B the Name cell rendered the status badge in a
            // sibling `<div className="mt-0.5">` — that's gone.
            const nameBlockStart = src.indexOf("id: 'name'");
            const nameBlockEnd = src.indexOf("id: 'status'", nameBlockStart);
            const nameBlock = src.slice(nameBlockStart, nameBlockEnd);
            // The Status badge is NOT inside the Name cell anymore.
            expect(nameBlock).not.toMatch(/<StatusBadge\b/);
        });
    });

    describe('Risk Code column + RSK-N key generation', () => {
        const schema = read('prisma/schema/compliance.prisma');
        const migration = read(
            'prisma/migrations/20260524200000_pr_b_risk_key/migration.sql',
        );
        const repo = read('src/app-layer/repositories/RiskRepository.ts');
        const ui = read(
            'src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx',
        );

        it('Risk schema declares the key field + RiskKeySequence model', () => {
            // The Risk block must carry a nullable `key String?`
            // field with the `@@unique([tenantId, key])` index.
            const riskBlock = schema.slice(
                schema.indexOf('model Risk {'),
                schema.indexOf('model RiskTemplate {'),
            );
            expect(riskBlock).toMatch(/^\s*key\s+String\?/m);
            expect(riskBlock).toMatch(
                /@@unique\(\[tenantId,\s*key\]\)/,
            );
            // Counter table declared.
            expect(schema).toMatch(/model RiskKeySequence/);
        });

        it('migration adds the column + counter table + RLS policies', () => {
            expect(migration).toMatch(/ALTER TABLE "Risk" ADD COLUMN "key"/);
            expect(migration).toMatch(/CREATE TABLE "RiskKeySequence"/);
            // Class A RLS pattern present.
            expect(migration).toMatch(
                /CREATE POLICY tenant_isolation ON "RiskKeySequence"/,
            );
            expect(migration).toMatch(
                /FORCE ROW LEVEL SECURITY/,
            );
            // Backfill seeds the counter from existing RSK-N keys.
            expect(migration).toMatch(
                /SUBSTRING\("key" FROM '\^RSK-\(\[0-9\]\+\)\$'\)/,
            );
        });

        it('RiskRepository.create mints from riskKeySequence.upsert', () => {
            expect(repo).toMatch(/riskKeySequence\.upsert/);
            expect(repo).toMatch(/`RSK-\$\{seq\.lastValue\}`/);
            // The mint guards on caller-supplied key (backfill path).
            expect(repo).toMatch(/if\s*\(!key\)\s*\{/);
        });

        it('RiskRepository list select includes key', () => {
            // Anchor on the riskListSelect const + the `key: true` line
            // INSIDE its body.
            expect(repo).toMatch(
                /const riskListSelect[\s\S]{0,400}key:\s*true/,
            );
        });

        it('Risks list page renders the Code column FIRST', () => {
            // The Code column declaration must appear before the
            // title column (column order = JSX order).
            const codeIdx = ui.indexOf("id: 'code'");
            const titleIdx = ui.indexOf("accessorKey: 'title'");
            expect(codeIdx).toBeGreaterThan(0);
            expect(titleIdx).toBeGreaterThan(codeIdx);
            // Header label is literally "Code".
            expect(ui).toMatch(
                /id:\s*['"]code['"],\s*header:\s*['"]Code['"]/,
            );
        });
    });

    describe('"+ Create X" button alignment — icon-balance ghost', () => {
        const src = read('src/components/ui/button.tsx');

        it('renders a ghost mirror of the icon when icon AND content present', () => {
            // The ghost is `aria-hidden`, `invisible` (Tailwind ⇒
            // visibility: hidden, takes space), and carries a stable
            // data attribute for downstream tests.
            expect(src).toMatch(/data-icon-balance-ghost/);
            expect(src).toMatch(/aria-hidden="true"/);
            expect(src).toMatch(
                /icon\s*&&\s*!loading\s*&&\s*content\s*&&\s*!shortcut\s*&&\s*!right/,
            );
        });

        it('does NOT render the ghost when a shortcut is present', () => {
            // The kbd shortcut already provides trailing weight; an
            // extra ghost would double-count it.
            const balanceBlockStart = src.indexOf('data-icon-balance-ghost');
            // Walk back to find the gating condition immediately
            // before the ghost JSX.
            const blockStart = src.lastIndexOf('{icon &&', balanceBlockStart);
            const gating = src.slice(blockStart, balanceBlockStart);
            expect(gating).toMatch(/!shortcut/);
        });
    });

    describe('first-column registry — Risks adoption refreshed', () => {
        const src = read('tests/guards/table-unification.test.ts');

        it('Risks registry entry declares firstColumnId="code"', () => {
            // Anchor on the file path so a future entry shuffle still
            // hits the right slot.
            const risksEntry = src.slice(
                src.indexOf('risks/RisksClient.tsx'),
                src.indexOf('risks/RisksClient.tsx') + 600,
            );
            expect(risksEntry).toMatch(/firstColumnId:\s*['"]code['"]/);
            expect(risksEntry).toMatch(/adopted:\s*true/);
        });
    });
});
