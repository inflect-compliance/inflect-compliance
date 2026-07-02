/**
 * Locks the two built-in vendor-assessment questionnaire fixtures (imported
 * from the customer's prior GRC tool as CSV) against their expected shape:
 * the Supplier Due Diligence Questionnaire and the Supplier Security
 * Assessment. Both are seeded per-tenant as global, published
 * VendorAssessmentTemplate rows (scripts/seed-vendor-questionnaires.ts +
 * prisma/seed.ts), so a fixture regression would silently corrupt every
 * tenant's questionnaire library.
 */
import ddFixture from '../../prisma/fixtures/vendor-questionnaire-supplier-due-diligence.json';
import saFixture from '../../prisma/fixtures/vendor-questionnaire-supplier-security-assessment.json';

type FixtureOption = { label: string; value: string; points: number };
type FixtureQuestion = {
    prompt: string;
    answerType: string;
    required: boolean;
    weight: number;
    options?: FixtureOption[];
    riskPoints?: Record<string, number>;
};
type FixtureSection = {
    title: string;
    description: string | null;
    weight: number;
    questions: FixtureQuestion[];
};
type Fixture = {
    key: string;
    name: string;
    description: string;
    scoringConfig: unknown;
    sections: FixtureSection[];
};

// Mirrors the Prisma `AnswerType` enum (prisma/schema/enums.prisma).
const VALID_ANSWER_TYPES = new Set([
    'YES_NO',
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'TEXT',
    'NUMBER',
    'SCALE',
    'FILE_UPLOAD',
]);

const dd = ddFixture as Fixture;
const sa = saFixture as Fixture;

const questionsOf = (f: Fixture): FixtureQuestion[] => f.sections.flatMap((s) => s.questions);

describe.each([
    { label: 'Supplier Due Diligence', fixture: dd, key: 'SUPPLIER_DUE_DILIGENCE', name: 'Supplier Due Diligence Questionnaire', sections: 4, questions: 27 },
    { label: 'Supplier Security Assessment', fixture: sa, key: 'SUPPLIER_SECURITY_ASSESSMENT', name: 'Supplier Security Assessment', sections: 5, questions: 33 },
])('$label questionnaire fixture', ({ fixture, key, name, sections, questions }) => {
    it('has the expected key and name constants', () => {
        expect(fixture.key).toBe(key);
        expect(fixture.name).toBe(name);
        expect(typeof fixture.description).toBe('string');
        expect(fixture.description.length).toBeGreaterThan(0);
    });

    it(`has ${sections} sections and ${questions} questions`, () => {
        expect(fixture.sections).toHaveLength(sections);
        expect(questionsOf(fixture)).toHaveLength(questions);
    });

    it('every section carries a title and unit weight', () => {
        for (const s of fixture.sections) {
            expect(s.title.length).toBeGreaterThan(0);
            expect(s.weight).toBe(1);
            expect(s.questions.length).toBeGreaterThan(0);
        }
    });

    it('every question has a valid AnswerType and a prompt', () => {
        for (const q of questionsOf(fixture)) {
            expect(VALID_ANSWER_TYPES.has(q.answerType)).toBe(true);
            expect(q.prompt.length).toBeGreaterThan(0);
            expect(typeof q.required).toBe('boolean');
            expect(q.weight).toBe(1);
        }
    });

    it('predefined questions carry options with numeric points + a riskPoints map; TEXT questions carry neither', () => {
        for (const q of questionsOf(fixture)) {
            if (q.answerType === 'TEXT') {
                expect(q.options).toBeUndefined();
                expect(q.riskPoints).toBeUndefined();
                continue;
            }
            // YES_NO / SINGLE_SELECT — predefined answer sets.
            expect(Array.isArray(q.options)).toBe(true);
            expect(q.options!.length).toBeGreaterThanOrEqual(2);
            for (const o of q.options!) {
                expect(o.label.length).toBeGreaterThan(0);
                expect(o.value.length).toBeGreaterThan(0);
                expect(typeof o.points).toBe('number');
                expect(Number.isFinite(o.points)).toBe(true);
            }
            expect(q.riskPoints).toBeDefined();
            expect(Object.keys(q.riskPoints!).length).toBe(q.options!.length);
        }
    });

    it('uses the WEIGHTED_AVERAGE scoring config with four rating thresholds', () => {
        const cfg = fixture.scoringConfig as { mode: string; ratingThresholds: unknown[] };
        expect(cfg.mode).toBe('WEIGHTED_AVERAGE');
        expect(cfg.ratingThresholds).toHaveLength(4);
    });
});

it('YES_NO questions are exactly the 2-option Yes/No sets', () => {
    for (const q of [...questionsOf(dd), ...questionsOf(sa)]) {
        if (q.answerType !== 'YES_NO') continue;
        expect(q.options).toHaveLength(2);
        const labels = q.options!.map((o) => o.label.toLowerCase()).sort();
        expect(labels).toEqual(['no', 'yes']);
    }
});
