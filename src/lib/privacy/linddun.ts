/**
 * LINDDUN privacy threat taxonomy — reference data + advisory PET hints.
 *
 * LINDDUN is a privacy threat-modeling methodology developed by the DistriNet
 * research group at KU Leuven (https://www.linddun.org), freely usable with
 * attribution. This module is a NATIVE, paraphrased reference encoding of its
 * seven privacy-threat categories — IC does NOT import the LINDDUN repo.
 *
 * It is a LENS over IC's existing risk machinery: a `Risk` (or `RiskTemplate`)
 * can be tagged with one or more LINDDUN category codes alongside its ordinary
 * `category`, and each category carries a set of canonical Privacy-Enhancing
 * Technology (PET) treatment HINTS. The hints are ADVISORY — surfaced for the
 * risk owner to consider, never auto-applied as treatments. IC does not run
 * differential privacy or anonymization; it SUGGESTS them.
 *
 * Attribution: LINDDUN (c) DistriNet, KU Leuven — https://www.linddun.org.
 */

export const LINDDUN_ATTRIBUTION =
    'LINDDUN privacy threat taxonomy © DistriNet, KU Leuven (https://www.linddun.org), used with attribution. Category descriptions are paraphrased.';

export type LinddunCode = 'L' | 'I' | 'N' | 'D' | 'DD' | 'U' | 'NC';

export interface LinddunCategory {
    code: LinddunCode;
    name: string;
    /** Paraphrased one-line definition of the privacy threat. */
    definition: string;
    /** Canonical PET / privacy-control treatment hints — ADVISORY only. */
    petHints: string[];
}

export const LINDDUN_CATEGORIES: readonly LinddunCategory[] = [
    {
        code: 'L',
        name: 'Linking',
        definition:
            'Associating data items or actions to learn more about an individual or group by relating records that were meant to stay separate.',
        petHints: ['Anonymization', 'Pseudonymization', 'Data minimization', 'Unlinkable identifiers'],
    },
    {
        code: 'I',
        name: 'Identifying',
        definition:
            'Singling out or re-identifying the individual behind data that was meant to be de-identified or anonymous.',
        petHints: ['Anonymization', 'Pseudonymization', 'Differential privacy', 'k-anonymity'],
    },
    {
        code: 'N',
        name: 'Non-repudiation',
        definition:
            'Being able to attribute a claim or action to an individual so they cannot plausibly deny it, where deniability is warranted.',
        petHints: ['Plausible deniability', 'Off-the-record mechanisms', 'Data minimization'],
    },
    {
        code: 'D',
        name: 'Detecting',
        definition:
            'Inferring the existence or involvement of an individual from observable side effects, even without reading the data itself.',
        petHints: ['Cover/dummy traffic', 'Message padding', 'Query obfuscation', 'Data minimization'],
    },
    {
        code: 'DD',
        name: 'Data Disclosure',
        definition:
            'Excessively collecting, storing, sharing, or exposing personal data beyond what is necessary or authorized.',
        petHints: ['Data minimization', 'Encryption', 'Access control', 'Purpose limitation'],
    },
    {
        code: 'U',
        name: 'Unawareness & Unintervenability',
        definition:
            'Individuals lack awareness of, or the ability to intervene in, the processing of their data (access, correction, deletion, consent withdrawal).',
        petHints: ['Transparency notices', 'Consent management', 'Data-subject access/erasure tooling', 'User privacy controls'],
    },
    {
        code: 'NC',
        name: 'Non-compliance',
        definition:
            'Processing personal data in a way that does not comply with legal, regulatory, or organizational privacy requirements.',
        petHints: ['Privacy policies', 'DPIA', 'Retention & deletion controls', 'Accountability mechanisms'],
    },
];

const BY_CODE = new Map<LinddunCode, LinddunCategory>(
    LINDDUN_CATEGORIES.map((c) => [c.code, c]),
);

export const LINDDUN_CODES: readonly LinddunCode[] = LINDDUN_CATEGORIES.map((c) => c.code);

export function isLinddunCode(value: unknown): value is LinddunCode {
    return typeof value === 'string' && BY_CODE.has(value as LinddunCode);
}

export function getLinddunCategory(code: LinddunCode): LinddunCategory | undefined {
    return BY_CODE.get(code);
}

/**
 * Normalize a raw stored value (e.g. a `Risk.linddunCategories` JSON column)
 * into the set of valid LINDDUN codes it carries. Tolerant of null / non-array
 * / unknown codes — returns only the recognized codes, de-duplicated in
 * taxonomy order.
 */
export function normalizeLinddunCodes(raw: unknown): LinddunCode[] {
    if (!Array.isArray(raw)) return [];
    const present = new Set(raw.filter(isLinddunCode));
    return LINDDUN_CODES.filter((c) => present.has(c));
}

/**
 * Advisory PET treatment hints for a set of LINDDUN categories — the union of
 * each category's canonical mitigations, in a stable order. ADVISORY: these are
 * suggestions for the risk owner, NOT auto-applied treatments.
 */
export function petHintsForCodes(codes: LinddunCode[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const code of normalizeLinddunCodes(codes)) {
        for (const hint of BY_CODE.get(code)!.petHints) {
            if (!seen.has(hint)) {
                seen.add(hint);
                out.push(hint);
            }
        }
    }
    return out;
}
