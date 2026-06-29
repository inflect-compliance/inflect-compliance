/**
 * AISVS vendor-coverage readout.
 *
 * A THIN translation layer on top of the existing vendor-assessment scoring:
 * given an AISVS vendor questionnaire's questions + the vendor's answers, it
 * reports how much of the assessed AISVS surface the vendor attests to — by
 * level (L1 / L2) and by AISVS chapter — for the buyer's procurement decision.
 *
 * It does NOT re-implement scoring; `vendor-scoring.ts` still produces the
 * risk score/rating. This is the "what does the score mean in AISVS terms"
 * readout.
 *
 * AISVS is referenced by ID only (CC-BY-SA-4.0); question prompts embed the
 * requirement id + level as `(AISVS C<ch>.<sec>.<req>, L<n>)`.
 */

/** Parsed AISVS reference from a question prompt. */
export interface AisvsRef {
    id: string; // e.g. "C2.1.3"
    chapter: string; // e.g. "C2"
    level: 'L1' | 'L2' | 'L3';
}

/** A question + the vendor's chosen answer value (yes/partial/no/na). */
export interface AisvsAnsweredQuestion {
    prompt: string;
    /** Normalised answer token: 'yes' | 'partial' | 'no' | 'na' (or null). */
    answer: string | null;
}

export interface AisvsLevelCoverage {
    applicable: number; // questions of this level the vendor did NOT mark N/A
    met: number; // "yes"
    partial: number; // "partial"
    /** (met + 0.5*partial) / applicable, 0-100; null when nothing applicable. */
    percent: number | null;
}

export interface AisvsChapterCoverage {
    chapter: string;
    applicable: number;
    percent: number | null;
}

export interface AisvsCoverageReadout {
    l1: AisvsLevelCoverage;
    l2: AisvsLevelCoverage;
    overall: AisvsLevelCoverage;
    byChapter: AisvsChapterCoverage[];
    /** Questions whose prompt carried no AISVS ref (e.g. the screening Q). */
    unmapped: number;
}

const AISVS_REF_RE = /\(AISVS\s+(C(\d+)\.\d+\.\d+),\s*(L[123])\)/;

/** Extract the AISVS reference embedded in a question prompt, if any. */
export function parseAisvsRef(prompt: string): AisvsRef | null {
    const m = prompt.match(AISVS_REF_RE);
    if (!m) return null;
    return { id: m[1], chapter: `C${m[2]}`, level: m[3] as AisvsRef['level'] };
}

function normalizeAnswer(a: string | null): 'yes' | 'partial' | 'no' | 'na' | null {
    if (!a) return null;
    const t = a.trim().toLowerCase();
    if (t === 'yes' || t === 'partial' || t === 'no' || t === 'na') return t;
    if (t === 'n/a') return 'na';
    return null;
}

function emptyLevel(): { applicable: number; met: number; partial: number } {
    return { applicable: 0, met: 0, partial: 0 };
}

function finalize(acc: { applicable: number; met: number; partial: number }): AisvsLevelCoverage {
    const percent =
        acc.applicable > 0
            ? Math.round(((acc.met + 0.5 * acc.partial) / acc.applicable) * 100)
            : null;
    return { applicable: acc.applicable, met: acc.met, partial: acc.partial, percent };
}

/**
 * Compute the AISVS coverage readout from answered questions. `N/A` answers are
 * excluded from the denominator (a chapter that doesn't apply to the vendor's
 * architecture shouldn't penalise coverage).
 */
export function computeAisvsCoverage(
    questions: AisvsAnsweredQuestion[],
): AisvsCoverageReadout {
    const l1 = emptyLevel();
    const l2 = emptyLevel();
    const overall = emptyLevel();
    const chapters = new Map<string, { applicable: number; met: number; partial: number }>();
    let unmapped = 0;

    for (const q of questions) {
        const ref = parseAisvsRef(q.prompt);
        if (!ref) {
            unmapped++;
            continue;
        }
        const ans = normalizeAnswer(q.answer);
        if (ans === 'na' || ans === null) continue; // not applicable / unanswered

        const bucket = ref.level === 'L1' ? l1 : ref.level === 'L2' ? l2 : null;
        const apply = (b: { applicable: number; met: number; partial: number }) => {
            b.applicable++;
            if (ans === 'yes') b.met++;
            else if (ans === 'partial') b.partial++;
        };
        if (bucket) apply(bucket);
        apply(overall);

        const ch = chapters.get(ref.chapter) ?? emptyLevel();
        apply(ch);
        chapters.set(ref.chapter, ch);
    }

    const byChapter: AisvsChapterCoverage[] = [...chapters.entries()]
        .map(([chapter, acc]) => ({ chapter, applicable: acc.applicable, percent: finalize(acc).percent }))
        .sort((a, b) => Number(a.chapter.slice(1)) - Number(b.chapter.slice(1)));

    return {
        l1: finalize(l1),
        l2: finalize(l2),
        overall: finalize(overall),
        byChapter,
        unmapped,
    };
}
