/**
 * Structural ratchet for the production sizing playbook (docs/sizing.md).
 *
 * Keeps the doc honest + complete: it must cover all four tiers and
 * every scalable component, cross-reference the SLO + observability
 * runbooks it claims to anchor on, and — critically — carry a
 * machine-readable PROVENANCE marker for every tier so no number can be
 * presented as fact without saying whether it's observed or
 * extrapolated. (The only real load data is a k6 smoke baseline; the
 * upper tiers are extrapolated, and the doc must keep admitting that.)
 */
import * as fs from 'fs';
import * as path from 'path';

const SIZING = path.resolve(__dirname, '../../docs/sizing.md');
const TIERS = ['small', 'medium', 'large', 'enterprise'];
const COMPONENTS = ['app', 'worker', 'pgbouncer', 'postgres', 'redis'];

describe('sizing doc coverage', () => {
    it('docs/sizing.md exists', () => {
        expect(fs.existsSync(SIZING)).toBe(true);
    });

    const doc = fs.existsSync(SIZING) ? fs.readFileSync(SIZING, 'utf-8') : '';
    const lower = doc.toLowerCase();

    it('names all four tiers', () => {
        for (const t of TIERS) expect(lower).toContain(t);
    });

    it('references every scalable component', () => {
        for (const c of COMPONENTS) expect(lower).toContain(c);
    });

    it('cross-references the SLO doc and an observability runbook', () => {
        expect(doc).toMatch(/docs\/slos\.md/);
        expect(doc).toMatch(/docs\/observability\//);
    });

    it('every tier carries a provenance marker (observed | extrapolated)', () => {
        // Machine-readable block: `<!-- sizing-provenance ... -->`.
        const block = doc.match(/<!--\s*sizing-provenance([\s\S]*?)-->/);
        expect(block).not.toBeNull();
        const body = (block?.[1] ?? '').toLowerCase();
        for (const t of TIERS) {
            // e.g. "small: observed — ..." / "medium: extrapolated — ..."
            const re = new RegExp(`${t}:\\s*(observed|extrapolated)\\b`);
            expect(body).toMatch(re);
        }
    });
});
