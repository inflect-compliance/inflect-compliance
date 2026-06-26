/**
 * Re-sync the vendored NIS2 gap-assessment question set from upstream.
 *
 * Source: https://github.com/NISD2/nis2-gap-assessment-schema
 * (content licensed CC BY 4.0 — see
 * prisma/fixtures/nis2-gap-assessment.LICENSE.md).
 *
 * The committed fixture (`prisma/fixtures/nis2-gap-assessment.json`) is a
 * DELIBERATELY PINNED snapshot so the seed/build is hermetic (no network
 * fetch at seed time). This script is the ONLY way that snapshot should be
 * regenerated — and it's an explicit operator action, never automatic
 * (no cron, no CI step). It:
 *
 *   1. fetches the raw upstream `data/gap-assessment.json`;
 *   2. translates the upstream INTEGER enums to OUR string enums
 *      (criticality 3 → "CRITICAL", respondent 0 → "CEO", …) so the rest
 *      of the codebase never deals with magic numbers;
 *   3. stamps provenance (source / license / attribution / importedAt);
 *   4. validates the result against the Zod schema (string enums); and
 *   5. writes the fixture back, pretty-printed.
 *
 * Run:  npx tsx scripts/sync-nis2-gap-assessment.ts
 *
 * German-law caveat: many questions cite German statutes (BSIG, §28, BSI
 * IT-Grundschutz). They are imported and TAGGED via `legalBasis`, never
 * dropped — the import is faithful to the source.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    Nis2GapAssessmentSchema,
    NIS2_CRITICALITY_BY_INDEX,
    NIS2_RESPONDENT_BY_INDEX,
    NIS2_CONSEQUENCE_BY_INDEX,
    NIS2_TIME_TO_FIX_BY_INDEX,
} from '@/lib/schemas/nis2-gap-assessment';

const UPSTREAM_RAW =
    'https://raw.githubusercontent.com/NISD2/nis2-gap-assessment-schema/main/data/gap-assessment.json';
const SOURCE_REPO = 'https://github.com/NISD2/nis2-gap-assessment-schema';
const ATTRIBUTION =
    'Based on the NIS2 Gap Assessment by Kardashev Catalyst UG / nisd2.eu, ' +
    'licensed under CC BY 4.0. ' +
    SOURCE_REPO;
const FIXTURE_PATH = path.resolve(
    __dirname,
    '../prisma/fixtures/nis2-gap-assessment.json',
);

function fromIndex<T>(arr: readonly T[], i: number, label: string): T {
    const v = arr[i];
    if (v === undefined) {
        throw new Error(`upstream ${label} index ${i} out of range`);
    }
    return v;
}

async function main() {
    process.stdout.write(`Fetching ${UPSTREAM_RAW} …\n`);
    const res = await fetch(UPSTREAM_RAW);
    if (!res.ok) {
        throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    }
    const upstream = (await res.json()) as {
        version: string;
        lastUpdated: string;
        domains: Array<Record<string, unknown>>;
        questions: Array<Record<string, unknown>>;
    };

    const domains = upstream.domains.map((d) => ({
        id: d.id as number,
        code: d.code as string,
        name: d.name as { en: string; de: string },
        description: d.description as { en: string; de: string },
        day: d.day as number,
    }));

    const questions = upstream.questions.map((q) => ({
        id: q.id as string,
        domain: q.domain as number,
        text: q.text as { en: string; de: string },
        plainText: q.plainText as { en: string; de: string },
        legalBasis: q.legalBasis as string,
        criticality: fromIndex(NIS2_CRITICALITY_BY_INDEX, q.criticality as number, 'criticality'),
        respondent: fromIndex(NIS2_RESPONDENT_BY_INDEX, q.respondent as number, 'respondent'),
        consequence: fromIndex(NIS2_CONSEQUENCE_BY_INDEX, q.consequence as number, 'consequence'),
        fineExposure: Boolean(q.fineExposure),
        timeToFix: fromIndex(NIS2_TIME_TO_FIX_BY_INDEX, q.timeToFix as number, 'timeToFix'),
        day: q.day as number,
        dependsOn: Array.isArray(q.dependsOn) ? (q.dependsOn as string[]) : [],
    }));

    const importedAt = new Date().toISOString().slice(0, 10);
    const out = {
        version: upstream.version,
        lastUpdated: upstream.lastUpdated,
        source: SOURCE_REPO,
        license: 'CC BY 4.0 (content) — https://creativecommons.org/licenses/by/4.0/',
        attribution: ATTRIBUTION,
        importedAt,
        domains,
        questions,
    };

    // Fail loudly if the translated shape drifts from our contract.
    const parsed = Nis2GapAssessmentSchema.parse(out);

    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(parsed, null, 2) + '\n');
    process.stdout.write(
        `✅ wrote ${parsed.domains.length} domains + ${parsed.questions.length} ` +
            `questions (upstream v${parsed.version}) → ${path.relative(process.cwd(), FIXTURE_PATH)}\n`,
    );
    process.stdout.write(
        '   Remember to bump the version stamp in ' +
            'prisma/fixtures/nis2-gap-assessment.LICENSE.md.\n',
    );
}

main().catch((err) => {
    process.stderr.write(`sync-nis2-gap-assessment failed: ${String(err)}\n`);
    process.exit(1);
});
