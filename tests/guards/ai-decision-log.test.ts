/**
 * AI decision log — ratchet (EU AI Act Art 12 / Art 14 + AI-ops).
 *
 *   - COVERAGE: every AI provider invocation routes through the logger — a new
 *     AI call site that calls getProvider() without logAiDecision fails CI.
 *   - PRIVACY: the log stores an inputDigest (SHA-256) + sanitised summary only;
 *     no raw prompt / PII field is ever written.
 *   - IMMUTABILITY: the log is append-only (a DB trigger blocks core edits); the
 *     only mutation is the one-way humanOutcome stamp.
 *   - FEEDBACK: humanOutcome transitions PENDING → terminal via the usecase; the
 *     model carries the two tenantId-leading indexes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out);
        else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(rel);
    }
    return out;
}

const LOGGER_RE = /logAiDecision\s*\(/;
// A file that imports the AI risk-assessment provider factory. Scoped to THIS
// module so we don't match the unrelated integrations `getProvider`.
const AI_PROVIDER_IMPORT_RE = /import\s*\{[^}]*\bgetProvider\b[^}]*\}\s*from\s*'@\/app-layer\/ai\/risk-assessment'/;

describe('coverage — every provider invocation logs a decision', () => {
    const sources = walk('src/app-layer').filter((f) => !f.includes('__tests__'));

    it('every AI-provider call site also calls logAiDecision()', () => {
        const offenders = sources.filter((f) => {
            const src = read(f);
            return AI_PROVIDER_IMPORT_RE.test(src) && !LOGGER_RE.test(src);
        });
        expect(offenders).toEqual([]);
    });

    it('the risk-suggestions usecase imports AND calls logAiDecision', () => {
        const src = read('src/app-layer/usecases/risk-suggestions.ts');
        expect(src).toContain("from '@/app-layer/ai/decision-log'");
        expect(LOGGER_RE.test(src)).toBe(true);
    });

    it('mutation proof — the detector flags a usecase that drops the logger', () => {
        const mutated = read('src/app-layer/usecases/risk-suggestions.ts').replace(/logAiDecision\s*\(/g, 'noop(');
        expect(AI_PROVIDER_IMPORT_RE.test(mutated) && !LOGGER_RE.test(mutated)).toBe(true);
    });
});

describe('privacy — digest + sanitised summary only', () => {
    const mod = read('src/app-layer/ai/decision-log/index.ts');

    it('the module hashes the input (SHA-256 digest), never stores it raw', () => {
        expect(mod).toContain("createHash('sha256')");
        expect(mod).toContain('inputDigest:');
    });

    it('the output summary is sanitised + bounded', () => {
        expect(mod).toContain('sanitizePlainText(');
        expect(mod).toContain('SUMMARY_MAX');
    });

    it('no raw prompt / raw input column is written', () => {
        // The create-data must not carry a raw prompt field.
        expect(mod).not.toMatch(/\b(rawPrompt|rawInput|prompt)\s*:/);
    });

    it('the schema has inputDigest and no raw prompt column', () => {
        const schema = read('prisma/schema/automation.prisma');
        const model = schema.slice(schema.indexOf('model AiDecisionLog'));
        expect(model).toContain('inputDigest');
        expect(model).not.toMatch(/\brawPrompt\b|\brawInput\b/);
    });
});

describe('immutability — append-only core record', () => {
    it('a migration installs the append-only trigger', () => {
        const mig = read('prisma/migrations/20260703130000_ai_decision_log/migration.sql');
        expect(mig).toContain('ai_decision_log_immutable');
        expect(mig).toContain('BEFORE UPDATE ON "AiDecisionLog"');
        expect(mig).toMatch(/append-only/i);
    });

    it('the decision-log module never updates the core record — only humanOutcome', () => {
        const mod = read('src/app-layer/ai/decision-log/index.ts');
        // The only Prisma write-back is recordDecisionOutcome's updateMany on
        // humanOutcome (scoped to aiDecisionLog so crypto's `.update()` is excluded).
        const updates = mod.match(/aiDecisionLog\.update(Many)?\s*\(/g) ?? [];
        expect(updates.length).toBe(1);
        expect(mod).toMatch(/data:\s*\{\s*humanOutcome:/);
    });
});

describe('feedback + indexes', () => {
    const schema = read('prisma/schema/automation.prisma');
    const model = schema.slice(schema.indexOf('model AiDecisionLog'), schema.indexOf('model AiDecisionLog') + 2000);

    it('humanOutcome transitions PENDING → terminal via recordDecisionOutcome', () => {
        const mod = read('src/app-layer/ai/decision-log/index.ts');
        expect(mod).toContain('export async function recordDecisionOutcome');
        expect(mod).toMatch(/humanOutcome:\s*'PENDING'/);
    });

    it('AiDecisionLog carries the two tenantId-leading indexes', () => {
        expect(model).toContain('@@index([tenantId, createdAt])');
        expect(model).toContain('@@index([tenantId, aiSystemId])');
    });

    it('feedback is wired into applySession + dismissSession', () => {
        const uc = read('src/app-layer/usecases/risk-suggestions.ts');
        expect(uc).toMatch(/recordDecisionOutcome\([\s\S]*?'ACCEPTED'|recordDecisionOutcome\([\s\S]*?ACCEPTED/);
        expect(uc).toMatch(/recordDecisionOutcome\([\s\S]*?'REJECTED'/);
    });
});

describe('AGPL tripwire', () => {
    it('the decision-log feature references no AegisAI material', () => {
        expect(/aegis/i.test(read('src/app-layer/ai/decision-log/index.ts'))).toBe(false);
    });
});
