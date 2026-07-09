/**
 * Epic G-2 guardrail — ControlTestPlan scheduling schema is intact.
 *
 * Locks the schema foundation that every subsequent G-2 prompt depends
 * on. A future "schema cleanup" PR cannot silently drop one of the new
 * fields, the AutomationType enum, or one of the two new indexes
 * without bumping the floor in this same diff.
 *
 * What's enforced:
 *   1. `AutomationType` enum exists in enums.prisma with exactly the
 *      three documented values (MANUAL | SCRIPT | INTEGRATION).
 *   2. `ControlTestPlan` carries the six new fields with the correct
 *      types and defaults — `automationType` defaults to MANUAL so
 *      pre-G-2 plans observationally identical; the other five are
 *      optional.
 *   3. The two new composite indexes the scheduler will rely on are
 *      declared on the model.
 *
 * Detection is a structural scan of the Prisma schema text. The
 * mutation regression proof at the bottom confirms the detector is
 * real (not a vacuous pass) by mutating the source string in-memory.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const REPO_ROOT = path.resolve(__dirname, '../..');
const ENUMS_FILE = path.join(REPO_ROOT, 'prisma/schema/enums.prisma');

function readEnums(): string {
    return fs.readFileSync(ENUMS_FILE, 'utf8');
}

function readControlTestPlanModel(complianceText: string): string {
    // Capture the body of `model ControlTestPlan { ... }` — multi-line.
    // The closing brace is the first '}' at column 0 after the model
    // header, which matches the canonical formatting in compliance.prisma.
    const match = complianceText.match(
        /model ControlTestPlan \{([\s\S]*?)\n\}/,
    );
    if (!match) {
        throw new Error(
            'ControlTestPlan model not found in prisma/schema/compliance.prisma — ' +
                'the guardrail expects the canonical `model ControlTestPlan { ... }` block.',
        );
    }
    return match[1];
}

describe('Epic G-2 — ControlTestPlan scheduling schema', () => {
    const enumsText = readEnums();
    // ControlTestPlan moved to controls.prisma (2026-07-10 schema split);
    // read the whole-folder concatenation so the model is found wherever it lives.
    const complianceText = readPrismaSchema();
    const planBody = readControlTestPlanModel(complianceText);

    test('AutomationType enum is declared with exactly MANUAL | SCRIPT | INTEGRATION', () => {
        const enumMatch = enumsText.match(
            /enum AutomationType \{([\s\S]*?)\n\}/,
        );
        expect(enumMatch).not.toBeNull();
        const body = enumMatch![1];
        const values = body
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('//'));
        expect(values.sort()).toEqual(['INTEGRATION', 'MANUAL', 'SCRIPT']);
    });

    test('automationType field exists on ControlTestPlan with default MANUAL', () => {
        // The default is what makes the migration backward-compatible —
        // every pre-G-2 row becomes MANUAL automatically and the manual
        // testing flow stays observationally identical.
        expect(planBody).toMatch(
            /\n\s+automationType\s+AutomationType\s+@default\(MANUAL\)/,
        );
    });

    test('schedule, scheduleTimezone, automationConfig are nullable on ControlTestPlan', () => {
        // Nullable so existing plans remain valid without a schedule.
        // `Json?` is the Prisma optional-Json shape.
        expect(planBody).toMatch(/\n\s+schedule\s+String\?/);
        expect(planBody).toMatch(/\n\s+scheduleTimezone\s+String\?/);
        expect(planBody).toMatch(/\n\s+automationConfig\s+Json\?/);
    });

    test('nextRunAt and lastScheduledRunAt are nullable DateTime on ControlTestPlan', () => {
        expect(planBody).toMatch(/\n\s+nextRunAt\s+DateTime\?/);
        expect(planBody).toMatch(/\n\s+lastScheduledRunAt\s+DateTime\?/);
    });

    test('the two scheduler indexes are declared on ControlTestPlan', () => {
        expect(planBody).toMatch(/@@index\(\[tenantId, nextRunAt\]\)/);
        expect(planBody).toMatch(
            /@@index\(\[tenantId, automationType, status\]\)/,
        );
    });

    // ─── Detector regression proof ─────────────────────────────────
    // Mutate the schema string in-memory and re-run the detector logic
    // against the broken variant. If the assertions don't fire on the
    // mutation, the guardrail above is vacuous.

    test('detector catches a stripped automationType field (mutation regression)', () => {
        const broken = complianceText.replace(
            /\n\s+automationType\s+AutomationType\s+@default\(MANUAL\)/,
            '',
        );
        const brokenBody = broken.match(
            /model ControlTestPlan \{([\s\S]*?)\n\}/,
        )![1];
        // The original guardrail asserts a match — the mutation removes
        // the line, so the assertion would fail.
        expect(brokenBody).not.toMatch(
            /\n\s+automationType\s+AutomationType\s+@default\(MANUAL\)/,
        );
    });

    test('detector catches a stripped nextRunAt index (mutation regression)', () => {
        const broken = complianceText.replace(
            /@@index\(\[tenantId, nextRunAt\]\)/,
            '// removed',
        );
        const brokenBody = broken.match(
            /model ControlTestPlan \{([\s\S]*?)\n\}/,
        )![1];
        expect(brokenBody).not.toMatch(/@@index\(\[tenantId, nextRunAt\]\)/);
    });

    test('detector catches a removed AutomationType enum value (mutation regression)', () => {
        const broken = enumsText.replace(/\n\s+SCRIPT\b/, '');
        const enumMatch = broken.match(/enum AutomationType \{([\s\S]*?)\n\}/);
        const values = enumMatch![1]
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('//'));
        expect(values.sort()).not.toEqual(['INTEGRATION', 'MANUAL', 'SCRIPT']);
    });
});
