/**
 * Guard — globals.css remote `@import` ordering.
 *
 * `@import "tailwindcss"` is inlined by the bundler and expands to
 * thousands of generated rules. A remote-URL `@import` (e.g. the
 * Google-Fonts stylesheet) cannot be inlined — it stays an `@import`
 * RULE in the compiled output. CSS requires every `@import` to precede
 * all other rules; Next 16's strict CSS parser hard-errors otherwise,
 * which fails to compile `globals.css` and returns a 500 on every page
 * that imports it — a site-wide outage.
 *
 * 2026-05-21: exactly this shipped — the Google-Fonts `@import` sat
 * after `@import "tailwindcss"` and took the whole site down in
 * `next dev`. This guard fails CI if a remote `@import url(...)` is
 * ever ordered after `@import "tailwindcss"` again.
 */
import * as fs from 'fs';
import * as path from 'path';

const GLOBALS = path.resolve(__dirname, '../../src/app/globals.css');

describe('globals.css @import ordering', () => {
    const lines = fs.readFileSync(GLOBALS, 'utf-8').split('\n');

    const tailwindIdx = lines.findIndex((l) =>
        /^\s*@import\s+["']tailwindcss["']/.test(l),
    );
    const remoteImportLines = lines
        .map((line, i) => ({ line, lineNo: i + 1 }))
        .filter(({ line }) => /^\s*@import\s+url\(\s*["']?https?:/i.test(line));

    test('@import "tailwindcss" is present', () => {
        expect(tailwindIdx).toBeGreaterThanOrEqual(0);
    });

    test('every remote @import url(...) precedes @import "tailwindcss"', () => {
        const tailwindLineNo = tailwindIdx + 1;
        const misplaced = remoteImportLines.filter(
            ({ lineNo }) => lineNo > tailwindLineNo,
        );
        if (misplaced.length > 0) {
            throw new Error(
                `globals.css: remote @import on line(s) ` +
                    `${misplaced.map((m) => m.lineNo).join(', ')} appear AFTER ` +
                    `\`@import "tailwindcss"\` (line ${tailwindLineNo}). ` +
                    `Tailwind's import inlines thousands of rules; a remote ` +
                    `@import after it is invalid CSS and 500s every page. ` +
                    `Move the remote @import above @import "tailwindcss".`,
            );
        }
        expect(misplaced).toEqual([]);
    });
});
