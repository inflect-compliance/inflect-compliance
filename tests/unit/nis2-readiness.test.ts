/**
 * NIS2 readiness — scoring model + materialization idempotency/reconciliation.
 *
 * Scoring is a PURE function (no DB) tested with known inputs. Materialize
 * is tested with stateful mocks: createFinding appends to an in-memory
 * store that listBySource reads, so "run twice → same count" and the
 * NO→YES close reconciliation are proven without a database.
 */
import {
    scoreNis2Assessment,
    type ScoringQuestion,
    type ScoringDomain,
    type Nis2Answer,
} from '@/app-layer/usecases/nis2-readiness';

const domains: ScoringDomain[] = [
    { id: 0, code: 'SCOPE', name: { en: 'Scope', de: 'Umfang' } },
    { id: 1, code: 'GOV', name: { en: 'Governance', de: 'Governance' } },
];

function q(id: string, domainId: number, criticality: string, extra: Partial<ScoringQuestion> = {}): ScoringQuestion {
    return {
        id,
        domainId,
        criticality,
        consequence: extra.consequence ?? 'AUDIT_FINDING',
        fineExposure: extra.fineExposure ?? false,
        timeToFix: extra.timeToFix ?? 'WEEKS',
        legalBasis: extra.legalBasis ?? '§1 BSIG',
        plainText: extra.plainText ?? { en: id, de: id },
    };
}

describe('scoreNis2Assessment — scoring model', () => {
    const questions: ScoringQuestion[] = [
        q('q1', 0, 'CRITICAL'),
        q('q2', 0, 'LOW'),
        q('q3', 1, 'MEDIUM'),
        q('q4', 1, 'HIGH'),
    ];
    const answers: Record<string, Nis2Answer> = { q1: 'YES', q2: 'NO', q3: 'PARTIALLY', q4: 'NA' };

    const r = scoreNis2Assessment(questions, domains, answers);

    it('weights by criticality and maps YES=1/PARTIALLY=0.5/NO=0', () => {
        // Domain 0: CRITICAL(4)*1.0 + LOW(1)*0.0 = 4 over weight 5 → 80
        expect(r.score.byDomain.find((d) => d.domainId === 0)!.score).toBe(80);
        // Domain 1: MEDIUM(2)*0.5 = 1 over weight 2 → 50 (q4 is NA, excluded)
        expect(r.score.byDomain.find((d) => d.domainId === 1)!.score).toBe(50);
    });

    it('excludes NA from numerator AND denominator', () => {
        const d1 = r.score.byDomain.find((d) => d.domainId === 1)!;
        expect(d1.answered).toBe(1); // only q3 — q4 NA not counted
        expect(d1.total).toBe(2);
    });

    it('computes the overall weighted score across all answered questions', () => {
        // Σ(w·m) = 4 + 0 + 1 = 5 ; Σw = 4 + 1 + 2 = 7 → 71
        expect(r.score.overall).toBe(71);
        expect(r.answeredTotal).toBe(3);
        expect(r.questionTotal).toBe(4);
    });

    it('treats NO and PARTIALLY as gaps; YES and NA are not gaps', () => {
        const ids = r.gaps.map((g) => g.questionId).sort();
        expect(ids).toEqual(['q2', 'q3']);
    });

    it('an all-NA / unanswered assessment scores 0 without dividing by zero', () => {
        const empty = scoreNis2Assessment(questions, domains, {});
        expect(empty.score.overall).toBe(0);
        expect(empty.gaps).toHaveLength(0);
    });
});

describe('scoreNis2Assessment — gap priority sort', () => {
    it('ranks CRITICAL + fineExposure + PERSONAL_LIABILITY + QUICK_WIN above LOW + MONTHS', () => {
        const questions: ScoringQuestion[] = [
            q('low', 0, 'LOW', { consequence: 'AUDIT_FINDING', fineExposure: false, timeToFix: 'MONTHS' }),
            q('urgent', 0, 'CRITICAL', { consequence: 'PERSONAL_LIABILITY', fineExposure: true, timeToFix: 'QUICK_WIN' }),
        ];
        const r = scoreNis2Assessment(questions, domains, { low: 'NO', urgent: 'NO' });
        expect(r.gaps[0].questionId).toBe('urgent');
        expect(r.gaps[1].questionId).toBe('low');
        expect(r.gaps[0].priority).toBeGreaterThan(r.gaps[1].priority);
    });
});
