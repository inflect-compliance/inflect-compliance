/**
 * Roadmap-4 PR-2 — decorative emoji subtraction.
 *
 * The i18n message catalogues (`messages/*.json`) had accreted
 * decorative emoji prefixes on user-facing copy:
 *
 *   "exportReports": "📈 Export Reports"
 *   "heatmap":       "🗺️ Heatmap"
 *   "approveEvidence": "✅ Approve"
 *   "rejectEvidence":  "❌ Reject"
 *   …16 more in en.json, 29 in bg.json
 *
 * Two costs:
 *
 *   1. Visual noise. The buttons + headings these strings render
 *      into already carry icons in their component slots
 *      (`<Button icon={<Plus />}>`, `<HeroIcon name="map" />`).
 *      The emoji prefix is a SECOND icon, rendered as text — and
 *      a less consistent one, since the text emoji renders
 *      differently across platforms (system font dependency).
 *
 *   2. Tone. A compliance product reads as serious software when
 *      labels say "Approve" / "Reject"; less so when they say
 *      "✅ Approve" / "❌ Reject". The emoji collapses the
 *      semantic into a sticker.
 *
 * What this ratchet locks
 *
 *   No string in any `messages/*.json` may contain a decorative
 *   emoji codepoint. The detector covers the three Unicode
 *   blocks where the drift came from:
 *
 *     • Miscellaneous Symbols and Pictographs (U+1F300–U+1F9FF)
 *     • Miscellaneous Symbols (U+2600–U+26FF)
 *     • Dingbats (U+2700–U+27BF)
 *
 *   Plus a handful of stragglers that fall outside those blocks
 *   but acted as drift drivers: ✅ ❌ ➕ ✓ ✗.
 *
 * What this ratchet does NOT police
 *
 *   - Source code outside `messages/` (notification email
 *     templates in `src/app-layer/notifications/*.ts` legitimately
 *     use emoji urgency markers — email clients render emoji
 *     consistently and the urgency convention is established).
 *
 *   - Code-comment doc bullets (✓ / ✗ in JSDoc capability lists).
 *     These never reach a user.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const MESSAGES_DIR = path.join(ROOT, 'messages');

// Detector — covers the three Unicode blocks plus the stragglers
// that drove drift. Order doesn't matter; the test just needs to
// fire on any one of them.
const EMOJI_RE =
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2705}\u{274C}\u{2795}\u{2713}\u{2717}]/u;

interface Offence {
    file: string;
    key: string;
    value: string;
}

function walk(obj: unknown, file: string, prefix: string, into: Offence[]) {
    if (typeof obj === 'string') {
        if (EMOJI_RE.test(obj)) {
            into.push({ file, key: prefix, value: obj });
        }
        return;
    }
    if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            walk(v, file, prefix ? `${prefix}.${k}` : k, into);
        }
    }
}

describe('No decorative emoji in messages (Roadmap-4 PR-2)', () => {
    it('every messages/*.json is free of decorative emoji codepoints', () => {
        const files = fs
            .readdirSync(MESSAGES_DIR)
            .filter((f) => f.endsWith('.json'));
        const offences: Offence[] = [];
        for (const f of files) {
            const full = path.join(MESSAGES_DIR, f);
            const obj = JSON.parse(fs.readFileSync(full, 'utf-8'));
            walk(obj, f, '', offences);
        }
        if (offences.length > 0) {
            const lines = offences
                .map((o) => `  ${o.file}: ${o.key} = ${o.value}`)
                .join('\n');
            throw new Error(
                `Decorative emojis found in i18n message catalogues. Strip the emoji — the UI carries icons in component slots already.\n${lines}`,
            );
        }
        expect(offences).toEqual([]);
    });
});
