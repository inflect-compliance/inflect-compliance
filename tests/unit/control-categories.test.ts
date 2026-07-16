/**
 * Unit tests for the canonical control-category vocabulary
 * (src/lib/controls/control-categories.ts). The load-bearing behaviour is that
 * a non-theme value is PRESERVED as an option so the editor never silently
 * drops a category it merely failed to resolve against the four ISO themes.
 */
import {
    CONTROL_CATEGORY_THEMES,
    isControlCategoryTheme,
    buildCategoryOptions,
    LEGACY_FREE_TEXT_TO_THEME,
} from '@/lib/controls/control-categories';

const label = (theme: string) => `label:${theme}`;

describe('control category vocabulary', () => {
    it('has exactly the four ISO 27002:2022 themes', () => {
        expect([...CONTROL_CATEGORY_THEMES]).toEqual(['ORGANIZATIONAL', 'PEOPLE', 'PHYSICAL', 'TECHNOLOGICAL']);
    });

    it('recognizes themes and rejects legacy/empty values', () => {
        expect(isControlCategoryTheme('TECHNOLOGICAL')).toBe(true);
        expect(isControlCategoryTheme('Access Control')).toBe(false);
        expect(isControlCategoryTheme('')).toBe(false);
        expect(isControlCategoryTheme(null)).toBe(false);
        expect(isControlCategoryTheme(undefined)).toBe(false);
    });

    it('buildCategoryOptions offers the four themes for a fresh (no-value) control', () => {
        const opts = buildCategoryOptions(undefined, label);
        expect(opts.map((o) => o.value)).toEqual(['ORGANIZATIONAL', 'PEOPLE', 'PHYSICAL', 'TECHNOLOGICAL']);
        expect(opts.every((o) => o.label === `label:${o.value}`)).toBe(true);
    });

    it('PRESERVES a non-theme current value as its own option (no silent loss)', () => {
        const opts = buildCategoryOptions('Logical Access', label);
        expect(opts).toHaveLength(5);
        const preserved = opts.find((o) => o.value === 'Logical Access');
        expect(preserved).toEqual({ value: 'Logical Access', label: 'Logical Access' });
        // …and it resolves, so the picker shows it rather than "None".
        expect(opts.find((o) => o.value === 'Logical Access')).toBeDefined();
    });

    it('does not duplicate a value that is already a theme', () => {
        const opts = buildCategoryOptions('ORGANIZATIONAL', label);
        expect(opts).toHaveLength(4);
        expect(opts.filter((o) => o.value === 'ORGANIZATIONAL')).toHaveLength(1);
    });

    it('maps every legacy free-text value to a valid theme', () => {
        const expected = {
            'Access Control': 'TECHNOLOGICAL',
            'Encryption': 'TECHNOLOGICAL',
            'Network Security': 'TECHNOLOGICAL',
            'Physical Security': 'PHYSICAL',
            'HR Security': 'PEOPLE',
            'Operations': 'TECHNOLOGICAL',
            'Compliance': 'ORGANIZATIONAL',
            'Incident Management': 'ORGANIZATIONAL',
            'Business Continuity': 'ORGANIZATIONAL',
        };
        expect(LEGACY_FREE_TEXT_TO_THEME).toEqual(expected);
        for (const theme of Object.values(LEGACY_FREE_TEXT_TO_THEME)) {
            expect(isControlCategoryTheme(theme)).toBe(true);
        }
    });
});
