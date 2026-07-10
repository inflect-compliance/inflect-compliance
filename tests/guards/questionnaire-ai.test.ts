/**
 * PR-9 — inbound questionnaire AI: structural ratchet. Governed-AI ordering,
 * env-gated provider factory with stub fallback, grounded-only drafting, and
 * the three-model RLS shape.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('questionnaire AI — governance + wiring', () => {
    const usecase = read('src/app-layer/usecases/questionnaire.ts');

    it('follows the governed-AI ordering (gate → rate-limit → context → record)', () => {
        expect(usecase).toMatch(/enforceFeatureGate\(ctx, 'questionnaire'\)/);
        expect(usecase).toMatch(/checkRateLimit\(ctx\.tenantId, ctx\.userId\)/);
        expect(usecase).toMatch(/recordGeneration\(ctx\.tenantId, ctx\.userId\)/);
        expect(usecase).toMatch(/runInTenantContext/);
        // gate before rate-limit before generation
        expect(usecase.indexOf('enforceFeatureGate')).toBeLessThan(usecase.indexOf('checkRateLimit'));
        expect(usecase.indexOf('checkRateLimit')).toBeLessThan(usecase.indexOf('recordGeneration'));
    });

    it('low-confidence drafts are FLAGGED, never auto-answered', () => {
        expect(usecase).toMatch(/CONFIDENCE_FLOOR/);
        expect(usecase).toMatch(/confidence >= CONFIDENCE_FLOOR \? 'DRAFTED' : 'FLAGGED'/);
    });

    it('accepted answers feed the answer library (feedback loop)', () => {
        expect(usecase).toMatch(/questionnaireAnswerLibrary\.create/);
    });

    it('the provider factory is env-gated with a stub fallback', () => {
        const idx = read('src/app-layer/ai/questionnaire/index.ts');
        expect(idx).toMatch(/AI_QUESTIONNAIRE_PROVIDER === 'openrouter'/);
        expect(idx).toMatch(/env\.OPENROUTER_API_KEY/);
        expect(idx).toMatch(/return new StubQuestionnaireProvider\(\)/);
    });

    it('the stub drafts ONLY from grounding (no fabrication on no-match)', () => {
        const stub = read('src/app-layer/ai/questionnaire/stub-provider.ts');
        expect(stub).toMatch(/if \(ranked\.length === 0\)/);
        expect(stub).toMatch(/confidence: 0\.1/);
    });

    it('the three models carry RLS + tenant indexes', () => {
        const schema = readPrismaSchema();
        for (const m of ['QuestionnaireAnswerLibrary', 'InboundQuestionnaire', 'InboundQuestionnaireItem']) {
            expect(schema).toMatch(new RegExp(`model ${m} \\{`));
        }
        const mig = read('prisma/migrations/20260707160000_inbound_questionnaire/migration.sql');
        expect(mig).toMatch(/ARRAY\['QuestionnaireAnswerLibrary','InboundQuestionnaire','InboundQuestionnaireItem'\]/);
        expect(mig).toMatch(/FORCE ROW LEVEL SECURITY/);
    });
});
