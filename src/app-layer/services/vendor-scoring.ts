/**
 * Pure scoring functions for vendor assessments.
 * No DB dependency — purely functional.
 */

export interface ScoringQuestion {
    id: string;
    weight: number;
    riskPointsJson: unknown; // { "YES": 0, "NO": 10 } etc
}

export interface ScoringAnswer {
    questionId: string;
    answerJson: unknown;
}

/**
 * Compute raw risk points for a single answer given the question's riskPointsJson mapping.
 * Returns 0 if no mapping is found.
 */
export function computeAnswerPoints(question: ScoringQuestion, answer: ScoringAnswer): number {
    if (!question.riskPointsJson) return 0;
    const mapping = question.riskPointsJson as Record<string, number>;

    // The answer could be a simple value (string/bool/number) or wrapped
    let key: string;
    const val = answer.answerJson;

    if (typeof val === 'boolean') {
        key = val ? 'YES' : 'NO';
    } else if (typeof val === 'string') {
        key = val.toUpperCase();
    } else if (typeof val === 'number') {
        key = String(val);
    } else if (val && typeof val === 'object' && 'value' in val) {
        key = String(val.value).toUpperCase();
    } else {
        return 0;
    }

    return mapping[key] ?? 0;
}

/**
 * Compute weighted total score across all answered questions.
 * Returns { score, maxPossible, percentScore }.
 * Higher score = higher risk.
 */
export function computeAssessmentScore(
    questions: ScoringQuestion[],
    answers: ScoringAnswer[]
): { score: number; maxPossible: number; percentScore: number } {
    const answerMap = new Map(answers.map(a => [a.questionId, a]));

    let weightedSum = 0;
    let totalWeight = 0;

    for (const q of questions) {
        const answer = answerMap.get(q.id);
        if (!answer) continue;

        const points = computeAnswerPoints(q, answer);
        weightedSum += points * q.weight;
        totalWeight += q.weight;
    }

    const maxPossible = totalWeight > 0 ? totalWeight * 10 : 0; // Assuming max points per question is 10
    const percentScore = maxPossible > 0 ? Math.round((weightedSum / maxPossible) * 100) : 0;

    return { score: Math.round(weightedSum * 100) / 100, maxPossible, percentScore };
}

/**
 * Map a percent score to a risk rating.
 * 0-25 = LOW, 26-50 = MEDIUM, 51-75 = HIGH, 76-100 = CRITICAL
 */
export function scoreToRiskRating(percentScore: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (percentScore <= 25) return 'LOW';
    if (percentScore <= 50) return 'MEDIUM';
    if (percentScore <= 75) return 'HIGH';
    return 'CRITICAL';
}
