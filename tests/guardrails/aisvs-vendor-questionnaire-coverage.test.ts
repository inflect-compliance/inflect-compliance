/**
 * AISVS AI-vendor questionnaire ratchet.
 *
 * IC assesses a THIRD-PARTY AI vendor against OWASP AISVS via the EXISTING
 * vendor-assessment engine (template content, not new plumbing). This guard
 * locks:
 *   - the AISVS vendor questionnaire fixture exists with the externally-
 *     assessable AISVS chapters as sections;
 *   - every scored question carries its AISVS requirement ID + level;
 *   - question prompts are PARAPHRASED, not verbatim AISVS prose (license);
 *   - the template carries the CC-BY-SA-4.0 + OWASP attribution;
 *   - the seed creates it as a global, published VendorAssessmentTemplate;
 *   - the AISVS-coverage readout maps answers back to AISVS L1/L2 percentages;
 *   - a low score raises a Finding via the EXISTING createFinding usecase
 *     (explicit opt-in, not raw prisma);
 *   - NO parallel assessment plumbing was added (reuses send/respond/review).
 *
 * AISVS is referenced by ID only (CC-BY-SA-4.0).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    computeAisvsCoverage,
    parseAisvsRef,
} from '@/app-layer/services/aisvs-vendor-coverage';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const fixture = JSON.parse(read('prisma/fixtures/aisvs-vendor-questionnaire.json')) as {
    key: string; name: string; description: string; attribution: string;
    sections: Array<{ title: string; weight: number; conditional: boolean; appliesTo?: string;
        questions: Array<{ aisvsId: string; level: string; weight: number; prompt: string; type?: string }> }>;
};

const scoredQuestions = fixture.sections
    .flatMap((s) => s.questions)
    .filter((q) => q.type !== 'ARCHETYPE');

describe('AISVS vendor questionnaire — fixture', () => {
    it('is keyed AISVS_AI_VENDOR with the externally-assessable AISVS chapters as sections', () => {
        expect(fixture.key).toBe('AISVS_AI_VENDOR');
        const titles = fixture.sections.map((s) => s.title).join(' | ');
        // The 7 always-on + 2 conditional externally-assessable chapters.
        for (const ch of ['C1', 'C2', 'C3', 'C5', 'C6', 'C7', 'C12', 'C8', 'C9']) {
            expect(titles).toContain(`(AISVS ${ch})`);
        }
    });

    it('conditional RAG (C8) + agentic (C9) sections are flagged conditional', () => {
        for (const s of fixture.sections.filter((x) => /AISVS C8|AISVS C9/.test(x.title))) {
            expect(s.conditional).toBe(true);
            expect(s.appliesTo).toBeTruthy();
        }
    });

    it('every scored question carries its AISVS requirement ID + level', () => {
        expect(scoredQuestions.length).toBeGreaterThanOrEqual(25);
        for (const q of scoredQuestions) {
            expect(q.aisvsId).toMatch(/^C\d+\.\d+\.\d+$/);
            expect(q.level).toMatch(/^L[12]$/);
            // The reference is embedded in the vendor-facing prompt.
            const ref = parseAisvsRef(q.prompt);
            expect(ref?.id).toBe(q.aisvsId);
            expect(ref?.level).toBe(q.level);
        }
    });

    // ── LICENSE: paraphrase, not verbatim AISVS prose ──
    it('prompts are short paraphrased questions, not verbatim requirement prose', () => {
        const offenders: string[] = [];
        for (const q of scoredQuestions) {
            // Strip the "(AISVS …)" reference before measuring the question.
            const body = q.prompt.replace(/\(AISVS[^)]*\)\s*$/, '').trim();
            if (body.split(/\s+/).length > 30) offenders.push(q.aisvsId);
        }
        expect(offenders).toEqual([]);
    });

    it('carries the CC-BY-SA-4.0 + OWASP attribution', () => {
        expect(fixture.attribution).toMatch(/CC-BY-SA-4\.0/);
        expect(fixture.attribution).toMatch(/OWASP/);
        expect(fixture.attribution).toContain('github.com/OWASP/AISVS');
    });
});

describe('AISVS vendor questionnaire — seed wiring', () => {
    const seed = read('prisma/seed.ts');

    it('seeds a global, published VendorAssessmentTemplate from the fixture', () => {
        expect(seed).toContain('aisvs-vendor-questionnaire.json');
        expect(seed).toMatch(/vendorAssessmentTemplate\.create/);
        expect(seed).toMatch(/isGlobal:\s*true/);
        expect(seed).toMatch(/isPublished:\s*true/);
    });
});

describe('AISVS vendor coverage readout (service)', () => {
    it('parses the AISVS ref embedded in a prompt', () => {
        const ref = parseAisvsRef('Do you screen untrusted inputs? (AISVS C2.1.3, L1)');
        expect(ref).toEqual({ id: 'C2.1.3', chapter: 'C2', level: 'L1' });
        expect(parseAisvsRef('Which best describes the AI system?')).toBeNull();
    });

    it('maps answers to AISVS L1/L2 percentages + per-chapter coverage', () => {
        const readout = computeAisvsCoverage([
            { prompt: 'q (AISVS C2.1.3, L1)', answer: 'yes' },
            { prompt: 'q (AISVS C2.2.1, L1)', answer: 'no' },
            { prompt: 'q (AISVS C7.2.1, L2)', answer: 'partial' },
            { prompt: 'q (AISVS C8.1.1, L1)', answer: 'na' }, // excluded
            { prompt: 'Screening question', answer: 'rag' }, // unmapped
        ]);
        expect(readout.l1).toMatchObject({ applicable: 2, met: 1, partial: 0, percent: 50 });
        expect(readout.l2).toMatchObject({ applicable: 1, partial: 1, percent: 50 });
        expect(readout.unmapped).toBe(1);
        const c2 = readout.byChapter.find((c) => c.chapter === 'C2');
        expect(c2?.percent).toBe(50);
        // N/A answer excluded → C8 has no applicable questions.
        expect(readout.byChapter.find((c) => c.chapter === 'C8')).toBeUndefined();
    });
});

describe('AISVS vendor risk linkage + reuse of existing plumbing', () => {
    const usecase = read('src/app-layer/usecases/aisvs-vendor-assessment.ts');

    it('raises findings via the EXISTING createFinding usecase (not raw prisma)', () => {
        expect(usecase).toMatch(/import\s*\{\s*createFinding\s*\}\s*from\s*'\.\/finding'/);
        expect(usecase).toMatch(/await createFinding\(/);
        // No bespoke finding/risk row creation.
        expect(usecase).not.toMatch(/db\.finding\.create|prisma\.finding\.create/);
    });

    it('adds NO parallel assessment plumbing (no new send/respond/submit)', () => {
        expect(usecase).not.toMatch(/loadResponseByToken|function submitResponse|function sendAssessment/);
    });

    it('the opt-in finding linkage is gated on coverage below a threshold', () => {
        expect(usecase).toMatch(/l1Threshold/);
        expect(usecase).toMatch(/raiseFindingFromAisvsCoverage/);
    });
});
