import { truncate, truncateGlyph, pluralize } from '@/lib/text-utils';

describe('truncate (ASCII ...)', () => {
    it('leaves short strings untouched', () => {
        expect(truncate('hello', 20)).toBe('hello');
    });
    it('truncates with ... counted within length', () => {
        expect(truncate('abcdefghij', 8)).toBe('abcde...');
    });
    it('returns null for nullish', () => {
        expect(truncate(null, 5)).toBeNull();
        expect(truncate(undefined, 5)).toBeNull();
    });
});

describe('truncateGlyph (… glyph)', () => {
    it('leaves strings at or under max untouched', () => {
        expect(truncateGlyph('exactly twenty chars', 20)).toBe('exactly twenty chars');
        expect(truncateGlyph('short', 20)).toBe('short');
    });
    it('keeps the first `max` characters then appends a single … glyph', () => {
        const out = truncateGlyph('this title is definitely longer than twenty', 20);
        expect(out).toBe('this title is defini…');
        expect(out).toEqual(expect.stringMatching(/…$/));
        // 20 content chars + the 1-char glyph
        expect(out).toHaveLength(21);
    });
    it('does not use the ASCII three-dot form', () => {
        expect(truncateGlyph('abcdefghijklmnopqrstuvwxyz', 20)).not.toContain('...');
    });
    it('returns null for nullish input', () => {
        expect(truncateGlyph(null, 20)).toBeNull();
        expect(truncateGlyph(undefined, 20)).toBeNull();
    });
});

describe('pluralize', () => {
    it('singular for 1, plural otherwise', () => {
        expect(pluralize('row', 1)).toBe('row');
        expect(pluralize('row', 2)).toBe('rows');
        expect(pluralize('entity', 0, { plural: 'entities' })).toBe('entities');
    });
});
