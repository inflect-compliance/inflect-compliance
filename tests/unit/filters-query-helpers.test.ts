/**
 * Filter Query Helpers — Functional Unit Tests
 *
 * Behavioural coverage for `src/lib/filters/query-helpers.ts`.
 * `normalizeQ` is a small transform but it runs on every server-side
 * search request (wired into Zod `.transform(normalizeQ)`), so its
 * trim / blank-collapse / max-length-clamp branches are load-bearing
 * and were previously untested.
 */

import { normalizeQ } from '../../src/lib/filters/query-helpers';

const MAX_Q_LENGTH = 200;

describe('normalizeQ', () => {
    test('undefined input passes through as undefined', () => {
        expect(normalizeQ(undefined)).toBeUndefined();
    });

    test('empty string normalises to undefined', () => {
        expect(normalizeQ('')).toBeUndefined();
    });

    test('a whitespace-only string normalises to undefined', () => {
        expect(normalizeQ('   ')).toBeUndefined();
        expect(normalizeQ('\t\n  ')).toBeUndefined();
    });

    test('surrounding whitespace is trimmed', () => {
        expect(normalizeQ('  iso 27001  ')).toBe('iso 27001');
    });

    test('a value with no whitespace is returned verbatim', () => {
        expect(normalizeQ('SOC2')).toBe('SOC2');
    });

    test('interior whitespace is preserved', () => {
        expect(normalizeQ('access control review')).toBe('access control review');
    });

    test('a query at exactly the max length is kept whole', () => {
        const atLimit = 'x'.repeat(MAX_Q_LENGTH);
        expect(normalizeQ(atLimit)).toHaveLength(MAX_Q_LENGTH);
    });

    test('a query over the max length is clamped to the limit', () => {
        const tooLong = 'y'.repeat(MAX_Q_LENGTH + 50);
        const result = normalizeQ(tooLong);
        expect(result).toHaveLength(MAX_Q_LENGTH);
        expect(result).toBe('y'.repeat(MAX_Q_LENGTH));
    });

    test('trim happens BEFORE the length clamp', () => {
        // 5 leading + 5 trailing spaces around a max-length core.
        // After trim the core is exactly MAX_Q_LENGTH and survives whole.
        const padded = `     ${'z'.repeat(MAX_Q_LENGTH)}     `;
        expect(normalizeQ(padded)).toBe('z'.repeat(MAX_Q_LENGTH));
    });
});
