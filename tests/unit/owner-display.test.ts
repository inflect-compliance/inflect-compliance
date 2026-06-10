/**
 * ownerDisplayName — Owner/assignee column shows name (or email local-part as a
 * username), never the full email address. UI roadmap item 14.
 */
import { ownerDisplayName } from '@/lib/owner-display';

describe('ownerDisplayName', () => {
    it('prefers the name when present', () => {
        expect(ownerDisplayName('Ada Lovelace', 'ada@example.com')).toBe('Ada Lovelace');
    });
    it('falls back to the email local-part (username) when no name', () => {
        expect(ownerDisplayName(null, 'ada.lovelace@example.com')).toBe('ada.lovelace');
        expect(ownerDisplayName('', 'jdoe@corp.test')).toBe('jdoe');
    });
    it('NEVER returns a full email address (no @domain leak)', () => {
        const out = ownerDisplayName(undefined, 'someone@example.com');
        expect(out).not.toContain('@');
    });
    it('trims whitespace-only names', () => {
        expect(ownerDisplayName('   ', 'x@y.z')).toBe('x');
    });
    it('returns null when neither name nor email is usable', () => {
        expect(ownerDisplayName(null, null)).toBeNull();
        expect(ownerDisplayName(undefined, undefined)).toBeNull();
        expect(ownerDisplayName('', '')).toBeNull();
    });
});
