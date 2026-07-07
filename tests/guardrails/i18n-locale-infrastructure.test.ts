/**
 * i18n locale-infrastructure ratchet.
 *
 * Locks the plumbing that makes a non-English UI locale actually reachable:
 *   - the supported-locale set + resolver behave (unknown → default fallback);
 *   - EVERY supported locale ships a parseable message catalog;
 *   - `src/i18n.ts` resolves the locale from the cookie (NOT hardcoded to
 *     'en' as it was before this work) — a regression back to the pinned
 *     literal would silently strand every non-en catalog again;
 *   - the language switcher persists the locale cookie CLIENT-SIDE (via
 *     `document.cookie`), not through a Server Action — a Server Action would
 *     couple the switch to a build-specific action ID and fail with
 *     `UnrecognizedActionError` on a stale tab after a deploy.
 *
 * Pure file reads — no DB, no runtime.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
    LOCALE_LABELS,
    isSupportedLocale,
    resolveLocale,
} from '@/lib/locale-constants';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('locale constants + resolver', () => {
    it('ships English + Bulgarian, defaulting to English', () => {
        expect([...SUPPORTED_LOCALES]).toEqual(expect.arrayContaining(['en', 'bg']));
        expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
        expect(DEFAULT_LOCALE).toBe('en');
    });

    it('every supported locale has an endonym label', () => {
        for (const l of SUPPORTED_LOCALES) {
            expect(LOCALE_LABELS[l]?.length).toBeGreaterThan(0);
        }
    });

    it('resolveLocale passes valid locales through and defaults everything else', () => {
        expect(resolveLocale('bg')).toBe('bg');
        expect(resolveLocale('en')).toBe('en');
        expect(resolveLocale('de')).toBe(DEFAULT_LOCALE); // unsupported
        expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
        expect(resolveLocale('../secret')).toBe(DEFAULT_LOCALE); // path-traversal guard
    });

    it('isSupportedLocale is a correct type guard', () => {
        expect(isSupportedLocale('bg')).toBe(true);
        expect(isSupportedLocale('xx')).toBe(false);
        expect(isSupportedLocale(undefined)).toBe(false);
    });
});

describe('message catalogs', () => {
    it('every supported locale has a parseable catalog', () => {
        for (const l of SUPPORTED_LOCALES) {
            const raw = read(`messages/${l}.json`);
            const parsed = JSON.parse(raw);
            expect(typeof parsed).toBe('object');
            expect(Object.keys(parsed).length).toBeGreaterThan(0);
        }
    });
});

describe('src/i18n.ts wiring (regression guard)', () => {
    const src = read('src/i18n.ts');

    it('resolves the locale from the cookie, not a hardcoded literal', () => {
        expect(src).toContain('resolveLocale');
        expect(src).toMatch(/cookies\(\)/);
        // The pre-i18n pin — `const locale = 'en'` — must not come back.
        expect(src).not.toMatch(/const\s+locale\s*=\s*['"]en['"]/);
    });
});

describe('locale switcher persists the cookie client-side', () => {
    const src = read('src/components/layout/LocaleSwitcher.tsx');

    it('writes the locale cookie in the browser, coerced through resolveLocale', () => {
        expect(src).toContain('document.cookie');
        expect(src).toContain('LOCALE_COOKIE');
        expect(src).toContain('resolveLocale'); // coerces before persisting
        expect(src).toContain('router.refresh'); // server tree re-reads the cookie
    });

    it('does NOT depend on a Server Action (deploy-skew regression guard)', () => {
        // A `'use server'` action would reintroduce the stale-action-ID 404.
        expect(src).not.toMatch(/^['"]use server['"]/m);
        expect(src).not.toContain('setLocaleAction');
        // The old server-action module must stay deleted.
        expect(fs.existsSync(path.join(ROOT, 'src/lib/set-locale-action.ts'))).toBe(false);
    });
});
