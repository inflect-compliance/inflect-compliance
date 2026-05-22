/**
 * Requirement Mapping Strength — Functional Unit Tests
 *
 * Behavioural coverage for the executable surface of
 * `src/app-layer/domain/requirement-mapping.types.ts`: the
 * `isValidMappingStrength` validator and the `MAPPING_STRENGTH_RANK`
 * ordering table. Both feed YAML-library ingestion and cross-framework
 * gap analysis, yet the file shipped at 0% coverage.
 *
 * (The pure type/interface exports in the module carry no runtime
 * behaviour and are intentionally not asserted here.)
 */

import {
    isValidMappingStrength,
    MAPPING_STRENGTHS,
    MAPPING_STRENGTH_RANK,
    type MappingStrengthValue,
} from '../../src/app-layer/domain/requirement-mapping.types';

// ═════════════════════════════════════════════════════════════════════
// 1. isValidMappingStrength — runtime validator
// ═════════════════════════════════════════════════════════════════════

describe('isValidMappingStrength', () => {
    test.each(MAPPING_STRENGTHS)('accepts the canonical value %s', (value) => {
        expect(isValidMappingStrength(value)).toBe(true);
    });

    test('rejects a lowercased value (the enum is case-sensitive)', () => {
        expect(isValidMappingStrength('equal')).toBe(false);
    });

    test('rejects an unknown string', () => {
        expect(isValidMappingStrength('OVERLAP')).toBe(false);
    });

    test('rejects the empty string', () => {
        expect(isValidMappingStrength('')).toBe(false);
    });

    test('rejects a value with surrounding whitespace', () => {
        expect(isValidMappingStrength(' EQUAL ')).toBe(false);
    });

    test('narrows the type on a true result', () => {
        const candidate = 'SUPERSET';
        if (isValidMappingStrength(candidate)) {
            // Inside the guard the value is a MappingStrengthValue.
            const narrowed: MappingStrengthValue = candidate;
            expect(narrowed).toBe('SUPERSET');
        } else {
            throw new Error('SUPERSET should be a valid strength');
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
// 2. MAPPING_STRENGTH_RANK — coverage-confidence ordering
// ═════════════════════════════════════════════════════════════════════

describe('MAPPING_STRENGTH_RANK', () => {
    test('EQUAL is the strongest (highest rank)', () => {
        const max = Math.max(...Object.values(MAPPING_STRENGTH_RANK));
        expect(MAPPING_STRENGTH_RANK.EQUAL).toBe(max);
    });

    test('RELATED is the weakest (lowest rank)', () => {
        const min = Math.min(...Object.values(MAPPING_STRENGTH_RANK));
        expect(MAPPING_STRENGTH_RANK.RELATED).toBe(min);
    });

    test('ranks descend EQUAL > SUPERSET > SUBSET > INTERSECT > RELATED', () => {
        expect(MAPPING_STRENGTH_RANK.EQUAL).toBeGreaterThan(MAPPING_STRENGTH_RANK.SUPERSET);
        expect(MAPPING_STRENGTH_RANK.SUPERSET).toBeGreaterThan(MAPPING_STRENGTH_RANK.SUBSET);
        expect(MAPPING_STRENGTH_RANK.SUBSET).toBeGreaterThan(MAPPING_STRENGTH_RANK.INTERSECT);
        expect(MAPPING_STRENGTH_RANK.INTERSECT).toBeGreaterThan(MAPPING_STRENGTH_RANK.RELATED);
    });

    test('every canonical strength has a rank', () => {
        for (const strength of MAPPING_STRENGTHS) {
            expect(typeof MAPPING_STRENGTH_RANK[strength]).toBe('number');
        }
    });

    test('ranks are unique — no two strengths sort equal', () => {
        const ranks = Object.values(MAPPING_STRENGTH_RANK);
        expect(new Set(ranks).size).toBe(ranks.length);
    });

    test('sorting by rank descending reproduces the canonical order', () => {
        const sorted = [...MAPPING_STRENGTHS].sort(
            (a, b) => MAPPING_STRENGTH_RANK[b] - MAPPING_STRENGTH_RANK[a],
        );
        expect(sorted).toEqual(['EQUAL', 'SUPERSET', 'SUBSET', 'INTERSECT', 'RELATED']);
    });

    test('a min-strength filter built on rank keeps only stronger-or-equal edges', () => {
        // Mirrors the `minStrength` query filter used in gap analysis.
        const minRank = MAPPING_STRENGTH_RANK.SUBSET;
        const kept = MAPPING_STRENGTHS.filter(
            (s) => MAPPING_STRENGTH_RANK[s] >= minRank,
        );
        expect([...kept].sort()).toEqual(['EQUAL', 'SUBSET', 'SUPERSET']);
    });
});
