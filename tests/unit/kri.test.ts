/**
 * RQ-6 — KRI RAG computation (pure). No DB.
 */
import { computeRag } from '@/app-layer/usecases/key-risk-indicator';

describe('computeRag', () => {
    describe('HIGHER_IS_WORSE', () => {
        it('value ≤ greenMax → GREEN', () => expect(computeRag(3, 'HIGHER_IS_WORSE', 5, 10)).toBe('GREEN'));
        it('greenMax < value ≤ amberMax → AMBER', () => expect(computeRag(7, 'HIGHER_IS_WORSE', 5, 10)).toBe('AMBER'));
        it('value > amberMax → RED', () => expect(computeRag(12, 'HIGHER_IS_WORSE', 5, 10)).toBe('RED'));
        it('boundary: value == greenMax → GREEN', () => expect(computeRag(5, 'HIGHER_IS_WORSE', 5, 10)).toBe('GREEN'));
    });

    describe('LOWER_IS_WORSE (high is good)', () => {
        it('low value → RED', () => expect(computeRag(3, 'LOWER_IS_WORSE', 5, 10)).toBe('RED'));
        it('mid value → AMBER', () => expect(computeRag(7, 'LOWER_IS_WORSE', 5, 10)).toBe('AMBER'));
        it('high value → GREEN', () => expect(computeRag(12, 'LOWER_IS_WORSE', 5, 10)).toBe('GREEN'));
    });

    describe('null thresholds', () => {
        it('both null → always GREEN', () => {
            expect(computeRag(9_999, 'HIGHER_IS_WORSE', null, null)).toBe('GREEN');
            expect(computeRag(-5, 'LOWER_IS_WORSE', null, null)).toBe('GREEN');
        });
        it('only greenMax set (HIGHER_IS_WORSE) — above green but no amber → RED', () => {
            expect(computeRag(8, 'HIGHER_IS_WORSE', 5, null)).toBe('RED');
        });
    });
});
