/**
 * Icon-only action discipline (2026-06-07).
 *
 * The reduction: in-scope page-level blue/yellow (primary/secondary)
 * action buttons are ICON-ONLY — text removed, meaning preserved through
 * a strong icon + the shared ~1s-delayed `<Tooltip>` + an `aria-label`.
 * One shared primitive carries the contract: `<IconAction>` (Button-based
 * sites) or a `<Tooltip>`-wrapped `size:'icon'` link (download/nav links).
 *
 * This ratchet stops the family drifting back into text-bearing clutter:
 * each in-scope site is pinned to its icon-only label, and the shared
 * contract is locked. Admin is explicitly OUT of scope and verified clean.
 *
 * OUT OF SCOPE (unchanged, NOT locked here): entity-create headers (keep
 * the noun — see action-button-canonical-entity-label), modal/dialog
 * confirms, form submits, Cancel.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const APP = 'src/app/t/[tenantSlug]/(app)';
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('icon-only action discipline', () => {
    describe('shared IconAction contract', () => {
        const src = read('src/components/ui/icon-action.tsx');
        it('renders icon-only (size="icon", no text/children)', () => {
            expect(src).toMatch(/size="icon"/);
            expect(src).toMatch(/Omit<\s*ButtonProps,[\s\S]*?'children'[\s\S]*?'text'/);
        });
        it('wraps the shared Tooltip (the ~1s-delayed, focus-accessible label)', () => {
            expect(src).toMatch(/<Tooltip content=\{label\}>/);
        });
        it('mirrors the label to aria-label (keyboard/SR certainty)', () => {
            expect(src).toMatch(/aria-label=\{label\}/);
        });
    });

    // Curated in-scope call sites. Each is pinned to its icon-only label
    // (IconAction `label=` OR a link `aria-label=`). The label string is
    // distinctive enough that its presence proves the icon-only button is
    // wired — and a revert to a text `<Button>Freeze Pack</Button>` would
    // drop the `label=`/`aria-label=` and fail here.
    const ICON_ACTION_SITES: Array<{ file: string; label: string; i18nKey?: string }> = [
        { file: `${APP}/audits/packs/[packId]/page.tsx`, label: 'Freeze pack' },
        { file: `${APP}/audits/packs/[packId]/page.tsx`, label: 'Generate share link' },
        { file: `${APP}/audits/packs/[packId]/page.tsx`, label: 'Clone for retest' },
        // label migrated to next-intl — resolves through the controls catalog.
        { file: `${APP}/controls/dashboard/page.tsx`, label: 'Consistency check', i18nKey: 'dashboard.consistencyCheck' },
        { file: `${APP}/tests/due/page.tsx`, label: 'Run due planning' },
        // UI-18: the evidence "Upload file" + "Import ZIP" icon buttons were
        // removed — the +Evidence button opens the upload modal directly.
        // The Tasks bulk "Apply" IconAction moved into the shared
        // <BulkActionBar> primitive (src/components/ui/bulk-action-bar.tsx), so
        // it's no longer an app-layer site.
    ];

    for (const { file, label, i18nKey } of ICON_ACTION_SITES) {
        it(`IconAction site stays icon-only: "${label}"`, () => {
            const src = read(file);
            expect(src).toMatch(/import \{ IconAction \} from '@\/components\/ui\/icon-action'/);
            if (i18nKey) {
                // Fully escape every regex metacharacter (backslash first) —
                // i18nKey is a trusted dotted literal, but a complete escaper
                // keeps the pattern honest and satisfies the SAST scanner.
                const escapedKey = i18nKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                expect(src).toMatch(
                    new RegExp(`<IconAction[\\s\\S]*?label=\\{t\\('${escapedKey}'\\)\\}`),
                );
                const en = JSON.parse(read('messages/en.json')) as { controls: Record<string, unknown> };
                const resolved = i18nKey
                    .split('.')
                    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), en.controls);
                expect(resolved).toBe(label);
            } else {
                expect(src).toMatch(
                    new RegExp(`<IconAction[\\s\\S]*?label="${label}"`),
                );
            }
        });
    }

    // Link sites (download / navigation) — icon-only via a Tooltip-wrapped
    // `size:'icon'` anchor with an aria-label.
    // `i18nKey` is set where the label was migrated to next-intl — the
    // aria-label + Tooltip render `tx('<key>')` and the English resolves
    // through the risks catalog.
    const LINK_SITES: Array<{ file: string; ariaLabel: string; i18nKey?: string }> = [
        { file: `${APP}/risks/RisksClient.tsx`, ariaLabel: 'Import risks', i18nKey: 'importRisks' },
        { file: `${APP}/audits/packs/[packId]/page.tsx`, ariaLabel: 'Export JSON' },
        { file: `${APP}/audits/packs/[packId]/page.tsx`, ariaLabel: 'Export CSV' },
    ];

    for (const { file, ariaLabel, i18nKey } of LINK_SITES) {
        it(`icon-only link stays icon-only: "${ariaLabel}"`, () => {
            const src = read(file);
            if (i18nKey) {
                expect(src).toMatch(
                    new RegExp(`aria-label=\\{tx\\('${i18nKey}'\\)\\}[\\s\\S]*?size: 'icon'`),
                );
                expect(src).toMatch(new RegExp(`<Tooltip content=\\{tx\\('${i18nKey}'\\)\\}>`));
                const en = JSON.parse(read('messages/en.json')) as { risks: Record<string, string> };
                expect(en.risks[i18nKey]).toBe(ariaLabel);
            } else {
                expect(src).toMatch(
                    new RegExp(`aria-label="${ariaLabel}"[\\s\\S]*?size: 'icon'`),
                );
                // wrapped in the shared Tooltip for the delayed label.
                expect(src).toMatch(/<Tooltip content="(?:Export JSON|Export CSV)">/);
            }
        });
    }

    describe('Admin exclusion', () => {
        // The rollout must not reach Admin — no IconAction usage there.
        const adminDir = path.join(ROOT, APP, 'admin');
        const walk = (dir: string): string[] =>
            fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
                const full = path.join(dir, e.name);
                return e.isDirectory()
                    ? walk(full)
                    : /\.(tsx|ts)$/.test(e.name)
                      ? [full]
                      : [];
            });
        it('no Admin-page file imports or uses IconAction', () => {
            const offenders = walk(adminDir).filter((f) =>
                /IconAction/.test(fs.readFileSync(f, 'utf8')),
            );
            expect(offenders).toEqual([]);
        });
    });
});
