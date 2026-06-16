/**
 * Anti-FOUC theme script — no dark→light flash on load / hard navigation.
 *
 * SSR ships `data-theme="dark"`; without a pre-paint correction a light-theme
 * user sees a dark flash until ThemeProvider's post-paint effect runs. The root
 * layout must render a blocking inline <script> in <head> that sets `data-theme`
 * from the persisted theme BEFORE first paint, reading the SAME storage key as
 * ThemeProvider.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('theme anti-FOUC init script', () => {
    const layout = read('src/app/layout.tsx');

    it('defines a pre-paint theme init script that sets data-theme', () => {
        expect(layout).toMatch(/THEME_INIT_SCRIPT/);
        expect(layout).toMatch(/document\.documentElement\.setAttribute\('data-theme'/);
        expect(layout).toMatch(/prefers-color-scheme: light/);
    });

    it('reads the SAME storage key as ThemeProvider (imported, not duplicated)', () => {
        expect(layout).toMatch(
            /import\s*\{\s*STORAGE_KEY as THEME_STORAGE_KEY\s*\}\s*from\s*['"]@\/components\/theme\/ThemeProvider['"]/,
        );
        expect(read('src/components/theme/ThemeProvider.tsx')).toMatch(
            /export const STORAGE_KEY = 'inflect:theme'/,
        );
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
