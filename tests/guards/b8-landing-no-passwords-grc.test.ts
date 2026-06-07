/**
 * B8 (2026-06-07) — repo landing page hygiene.
 *
 * 1. No demo USER PASSWORD is published in the README (landing page) or the
 *    operator docs that listed it (staging, load-test). The password lives
 *    only in the seed script; the docs reference it, not its value.
 * 2. The README leads with broad GRC framing, not ISO-27001-first.
 *
 * (The seed's own hardcoded default is the separate secret-remediation
 * concern tracked under B9 — this ratchet guards the user-facing docs.)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const README = read('README.md');
const DOCS_WITH_CREDS = [
    'README.md',
    'docs/staging.md',
    'tests/load/README.md',
];

describe('B8 — landing page: no demo passwords + GRC framing', () => {
    it('no doc publishes the literal demo password', () => {
        for (const p of DOCS_WITH_CREDS) {
            expect(read(p)).not.toMatch(/password123/i);
        }
    });

    it('the README leads with broad GRC framing, not ISO-27001-first', () => {
        // GRC framing present in the intro…
        const intro = README.split('\n').slice(0, 4).join('\n');
        expect(intro).toMatch(/Governance, Risk & Compliance|GRC/);
        expect(intro).toMatch(/multiple frameworks/i);
        // …and the old ISO-only opener is gone.
        expect(intro).not.toMatch(
            /^End-to-end ISO\/IEC 27001:2022 compliance management platform/m,
        );
    });
});
