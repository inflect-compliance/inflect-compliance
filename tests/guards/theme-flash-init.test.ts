/**
 * Anti-FOUC theme — no dark→light flash on load / hard navigation.
 *
 * PRIMARY fix: the root layout renders `<html data-theme>` from the persisted
 * theme COOKIE, so a returning user's first SSR byte is already correct — no
 * client script has to win a race against first paint (immune to CSP/nonce/
 * cache races, which is what made the inline-only approach flaky in prod).
 *
 * SECONDARY (first-visit only): a blocking inline <script> in <head> resolves
 * cookie → localStorage → system preference before paint AND writes the cookie
 * so the next SSR is correct. ThemeProvider mirrors theme to BOTH the cookie
 * and localStorage.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('theme anti-FOUC', () => {
    const layout = read('src/app/layout.tsx');
    const provider = read('src/components/theme/ThemeProvider.tsx');

    describe('primary: SSR data-theme from the cookie (flash-proof)', () => {
        it('renders <html data-theme={initialTheme}> seeded from the theme cookie', () => {
            // The flash-proof guarantee: SSR markup is the persisted theme, not
            // a hardcoded `dark` corrected later by a client script.
            expect(layout).toMatch(/<html lang=\{locale\} data-theme=\{initialTheme\}/);
            expect(layout).toMatch(/cookies\(\)\)\.get\(THEME_COOKIE\)/);
            expect(layout).toMatch(
                /import\s*\{[\s\S]*?\bcookies\b[\s\S]*?\}\s*from\s*['"]next\/headers['"]/,
            );
        });

        it('ThemeProvider exports THEME_COOKIE and persists to the cookie', () => {
            expect(provider).toMatch(/export const THEME_COOKIE = 'inflect_theme'/);
            expect(provider).toMatch(/document\.cookie\s*=\s*`\$\{THEME_COOKIE\}=/);
            expect(provider).toMatch(/function persistTheme/);
        });
    });

    describe('secondary: pre-paint inline init script', () => {
        it('defines a pre-paint theme init script that sets data-theme', () => {
            expect(layout).toMatch(/THEME_INIT_SCRIPT/);
            expect(layout).toMatch(/setAttribute\('data-theme'/);
            expect(layout).toMatch(/prefers-color-scheme: light/);
        });

        it('reads the SAME keys as ThemeProvider (imported, not duplicated)', () => {
            // Broadened: the layout now imports STORAGE_KEY + THEME_COOKIE + Theme.
            expect(layout).toMatch(
                /import\s*\{[\s\S]*?STORAGE_KEY as THEME_STORAGE_KEY[\s\S]*?\}\s*from\s*['"]@\/components\/theme\/ThemeProvider['"]/,
            );
            expect(layout).toMatch(
                /import\s*\{[\s\S]*?\bTHEME_COOKIE\b[\s\S]*?\}\s*from\s*['"]@\/components\/theme\/ThemeProvider['"]/,
            );
            expect(provider).toMatch(/export const STORAGE_KEY = 'inflect:theme'/);
        });

        it('renders the script in <head> with the CSP nonce, before the body', () => {
            const headIdx = layout.indexOf('<head>');
            const scriptIdx = layout.indexOf('__html: THEME_INIT_SCRIPT');
            const bodyIdx = layout.indexOf('<body');
            expect(headIdx).toBeGreaterThanOrEqual(0);
            expect(scriptIdx).toBeGreaterThan(headIdx);
            expect(scriptIdx).toBeLessThan(bodyIdx);
            // nonce-carrying script (CSP strict-dynamic)
            expect(layout).toMatch(/nonce=\{nonce\}\s*\n\s*suppressHydrationWarning\s*\n\s*dangerouslySetInnerHTML=\{\{ __html: THEME_INIT_SCRIPT \}\}/);
        });
    });
});
