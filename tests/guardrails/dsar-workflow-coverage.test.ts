/**
 * Structural ratchet — DSAR workflow (GDPR Art. 15 / 17).
 *
 * The DSAR feature is a multi-PR sequence (see docs/dsar.md). This ratchet
 * holds the foundation's shape AND the safety invariants that every later
 * stage must preserve:
 *   - the DataSubjectRequest model + the two job files exist,
 *   - the erasure path carries a 24h cooling-off guard,
 *   - audit pseudonymization (NULL userId) is the chosen approach, NOT
 *     AuditLog deletion,
 *   - the rejection criteria are enumerated as constants,
 *   - docs/dsar.md has its five canonical sections,
 *   - data-retention.md cross-links to it.
 *
 * A future stage that drops the cooling-off guard, switches to audit
 * deletion, or removes a rejection reason fails CI here.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8') : '';

const authSchema = read('prisma/schema/auth.prisma');
const enums = read('prisma/schema/enums.prisma');
const dsarLib = read('src/lib/dsar.ts');
const erasure = read('src/app-layer/jobs/dsar-erasure.ts');
const exportJob = read('src/app-layer/jobs/dsar-export.ts');
const doc = read('docs/dsar.md');
const retention = read('docs/data-retention.md');

describe('DSAR schema + jobs', () => {
    it('DataSubjectRequest model + its enums exist', () => {
        expect(authSchema).toMatch(/model\s+DataSubjectRequest\s*\{/);
        expect(enums).toMatch(/enum\s+DataSubjectRequestType\s*\{/);
        expect(enums).toMatch(/enum\s+DataSubjectRequestStatus\s*\{/);
    });

    it('both job files exist', () => {
        expect(erasure.length).toBeGreaterThan(0);
        expect(exportJob.length).toBeGreaterThan(0);
    });
});

describe('erasure safety invariants', () => {
    it('the erasure path carries a 24h cooling-off check', () => {
        expect(dsarLib).toMatch(/DSAR_COOLING_OFF_HOURS\s*=\s*24/);
        expect(erasure).toMatch(/coolingOffElapsed/);
    });

    it('audit pseudonymization (NULL userId) is preferred over deletion', () => {
        // The erasure contract sets userId NULL, and explicitly NOT delete.
        expect(erasure).toMatch(/userId\s*=\s*NULL/i);
        expect(erasure).toMatch(/NOT deletion|not delet/i);
    });
});

describe('rejection criteria are enumerated', () => {
    it('LAST_OWNER, OUTSTANDING_BALANCE, LEGAL_HOLD are constants', () => {
        for (const k of ['LAST_OWNER', 'OUTSTANDING_BALANCE', 'LEGAL_HOLD']) {
            expect(dsarLib).toContain(k);
        }
        expect(dsarLib).toMatch(/export function evaluateDsarRejection/);
    });
});

describe('documentation', () => {
    const REQUIRED = [
        '## Workflow',
        '## Rejection criteria',
        '## Audit-log pseudonymization (not deletion)',
        '## Export bundle contents',
        '## What happens to authored content',
    ];
    it('docs/dsar.md has the five canonical sections', () => {
        expect(doc.length).toBeGreaterThan(0);
        const missing = REQUIRED.filter((h) => !doc.includes(`\n${h}\n`));
        expect(missing).toEqual([]);
    });

    it('data-retention.md cross-links to dsar.md', () => {
        expect(retention).toMatch(/dsar\.md/);
    });
});
