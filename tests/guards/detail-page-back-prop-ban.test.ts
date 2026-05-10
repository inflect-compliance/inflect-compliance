/**
 * Roadmap-10 PR-9 — detail-page `back={...}` prop ban.
 *
 * R9 north-star decision (locked 2026-05-11): detail-page top-left
 * navigation is **breadcrumbs only**. The `back={...}` prop on
 * `<EntityDetailLayout>` / `<PageHeader>` parallels the breadcrumb
 * trail with an extra back button — two ways to go up, neither
 * obvious to choose between, both consuming chrome.
 *
 * Both primitives still EXPOSE the `back` prop (interfaces are
 * load-bearing through other consumers); but no app page should
 * pass it. Pass `breadcrumbs={...}` instead — every detail-page
 * primitive renders them.
 *
 * Scan: any `<EntityDetailLayout` or `<PageHeader` JSX in
 * `src/app/**` that passes a `back={...}` prop is a violation.
 * The scanner strips JS/TS comments first so doc-block references
 * to the prop don't false-positive.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = path.resolve(ROOT, 'src/app');

function walk(dir: string, results: string[] = []): string[] {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, results);
        } else if (entry.name.endsWith('.tsx')) {
            results.push(full);
        }
    }
    return results;
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
}

// Capture EntityDetailLayout / PageHeader JSX blocks, then check for
// `back={` inside the opening tag block. `[\s\S]` matches any char
// INCLUDING newline (used in place of the `s` / dotAll flag because
// tsconfig targets pre-ES2018).
const PRIMITIVE_BLOCK_RE =
    /<(?:EntityDetailLayout|PageHeader)\b[\s\S]*?(?:>|\/>)/g;

describe('detail-page back prop ban (R10-PR9)', () => {
    test('no <EntityDetailLayout> or <PageHeader> in src/app passes back={...}', () => {
        const offenders: { file: string; snippet: string }[] = [];
        for (const file of walk(APP_ROOT)) {
            const content = stripComments(fs.readFileSync(file, 'utf-8'));
            const blocks = content.match(PRIMITIVE_BLOCK_RE);
            if (!blocks) continue;
            for (const block of blocks) {
                if (/\sback=\{/.test(block)) {
                    offenders.push({
                        file: path.relative(ROOT, file),
                        snippet: block.slice(0, 120),
                    });
                }
            }
        }
        if (offenders.length > 0) {
            const sample = offenders
                .slice(0, 10)
                .map((o) => `  ${o.file}\n    ${o.snippet}`)
                .join('\n');
            throw new Error(
                `${offenders.length} site(s) pass back={...} to <EntityDetailLayout> or <PageHeader>:\n${sample}\n\nFix: remove the back prop. Both primitives render breadcrumbs, which are the canonical up-navigation. If breadcrumbs aren't already passed, pass \`breadcrumbs={[{ label, href }, …]}\` instead.`,
            );
        }
    });

    test('EntityDetailLayout primitive still exposes back?: prop (interface, not call sites)', () => {
        // Lock the primitive's interface intentionally — only call
        // sites are banned. The prop remains in the type so external
        // consumers / library callers can pass it. The ratchet's job
        // is to ban its use in OUR app pages.
        const src = fs.readFileSync(
            path.resolve(ROOT, 'src/components/layout/EntityDetailLayout.tsx'),
            'utf-8',
        );
        expect(src).toMatch(/back\?:\s*\{[^}]*href:\s*string/);
    });
});
