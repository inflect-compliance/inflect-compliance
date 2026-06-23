/**
 * Branch coverage for `src/lib/controls/control-taxonomy.ts` (pure, dep-free).
 *
 * Exercises:
 *   parseIsoClause:
 *     - null/undefined/empty → null.
 *     - "A.5.15" / "A-5.15" / "5.15" forms → normalized "5.15".
 *     - non-ISO ("CC5.1", "9.1", garbage) → null.
 *   iso27001Domain:
 *     - known clause → domain.
 *     - parseable but unmapped clause → null (the `?? null` arm).
 *     - unparseable → null.
 *   categorizeControl resolution order (1→4):
 *     1. ISO by annexId, then by code.
 *     2. framework by code prefix (SOC2/NIS2/QMS/SCS/RTS/NIST) → persisted or label.
 *     3. persisted category, unknown framework → "other" bucket.
 *     4. nothing → null.
 *   detectByCodePrefix every prefix branch + the empty-code guard.
 */
import {
    parseIsoClause,
    iso27001Domain,
    categorizeControl,
    ISO27001_DOMAIN,
    FRAMEWORK_LABELS,
    UNCLASSIFIED_FRAMEWORK_KEY,
} from '@/lib/controls/control-taxonomy';

describe('parseIsoClause', () => {
    it('returns null for null/undefined/empty', () => {
        expect(parseIsoClause(null)).toBeNull();
        expect(parseIsoClause(undefined)).toBeNull();
        expect(parseIsoClause('')).toBeNull();
    });

    it('parses the accepted annex forms to a bare clause', () => {
        expect(parseIsoClause('A.5.15')).toBe('5.15');
        expect(parseIsoClause('A-5.15')).toBe('5.15');
        expect(parseIsoClause('5.15')).toBe('5.15');
        expect(parseIsoClause('8.34')).toBe('8.34');
        expect(parseIsoClause('  a.6.1 ')).toBe('6.1');
    });

    it('returns null for non-ISO references', () => {
        expect(parseIsoClause('CC5.1')).toBeNull();
        expect(parseIsoClause('9.1')).toBeNull(); // family outside 5-8
        expect(parseIsoClause('NIS2-3')).toBeNull();
    });
});

describe('iso27001Domain', () => {
    it('maps a known clause to its domain', () => {
        expect(iso27001Domain('A.5.15')).toBe(ISO27001_DOMAIN.ACCESS_CONTROL);
        expect(iso27001Domain('8.24')).toBe(ISO27001_DOMAIN.CRYPTO);
    });

    it('returns null for a parseable but unmapped clause', () => {
        // 5.99 parses (5.<2 digits>) but has no map entry → `?? null`.
        expect(iso27001Domain('5.99')).toBeNull();
    });

    it('returns null for an unparseable value', () => {
        expect(iso27001Domain('CC5.1')).toBeNull();
        expect(iso27001Domain(null)).toBeNull();
    });
});

describe('categorizeControl', () => {
    it('1. resolves ISO by annexId', () => {
        const c = categorizeControl({ annexId: 'A.8.24', code: 'X', category: 'ignored' });
        expect(c).toEqual({
            frameworkKey: 'iso27001',
            frameworkLabel: FRAMEWORK_LABELS.iso27001,
            category: ISO27001_DOMAIN.CRYPTO,
        });
    });

    it('1b. falls back to ISO-shaped code when annexId is absent', () => {
        const c = categorizeControl({ code: '5.15' });
        expect(c?.category).toBe(ISO27001_DOMAIN.ACCESS_CONTROL);
        expect(c?.frameworkKey).toBe('iso27001');
    });

    it('2. detects SOC2 by code prefix and uses persisted category', () => {
        const c = categorizeControl({ code: 'CC5.1', category: 'Control Activities' });
        expect(c?.frameworkKey).toBe('soc2');
        expect(c?.category).toBe('Control Activities');
    });

    it('2b. falls back to the framework label when no persisted category', () => {
        const c = categorizeControl({ code: 'NIS2-3' });
        expect(c?.frameworkKey).toBe('nis2');
        expect(c?.category).toBe(FRAMEWORK_LABELS.nis2);
    });

    it('2c. detects each remaining framework prefix', () => {
        expect(categorizeControl({ code: 'QMS-1' })?.frameworkKey).toBe('iso9001');
        expect(categorizeControl({ code: 'SCS.2' })?.frameworkKey).toBe('iso28000');
        expect(categorizeControl({ code: 'RTS-4' })?.frameworkKey).toBe('iso39001');
        expect(categorizeControl({ code: 'AC-1' })?.frameworkKey).toBe('nist80053');
        expect(categorizeControl({ code: 'SC-7' })?.frameworkKey).toBe('nist80053');
    });

    it('3. persisted category with unknown framework → "other" bucket', () => {
        const c = categorizeControl({ code: 'ZZZ-99', category: 'Custom thing' });
        expect(c).toEqual({
            frameworkKey: UNCLASSIFIED_FRAMEWORK_KEY,
            frameworkLabel: '',
            category: 'Custom thing',
        });
    });

    it('4. returns null when nothing to group on', () => {
        expect(categorizeControl({})).toBeNull();
        expect(categorizeControl({ code: '', category: '' })).toBeNull();
        expect(categorizeControl({ code: 'ZZZ-99' })).toBeNull();
    });
});
