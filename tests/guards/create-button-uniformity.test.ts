/**
 * v2-fu-2 — Create button uniformity ratchet.
 *
 * Asserts the positive contract for create-action buttons. Pairs
 * with `tests/guards/action-label-vocabulary.test.ts` (which owns
 * the BAN side — no legacy `New|Add|Create X` text).
 *
 * The convention (v2-fu-2):
 *   Every "create" button reads literally `+ <Singular Noun>` and
 *   uses `<Button variant="primary">` (default `size="md"` — h-9 px).
 *
 *   - The `+` IS the icon. No separate `<Plus>` component.
 *   - The variant is locked to `primary` so the `+` glyph is
 *     uniformly white-on-brand across every create button.
 *   - The size is locked to `md` (no `sm` / `xs`) so the pill
 *     height is constant.
 *
 * What this ratchet enforces
 *   1. JSX `<Button ...>+ <Word>...</Button>` must declare
 *      `variant="primary"`. Calls without an explicit variant
 *      inherit the default (`primary`) so they pass.
 *   2. The same buttons must NOT declare `size="sm"` or `size="xs"`
 *      — calls without an explicit size pass (default = `md`).
 *
 * Pairs with:
 *   - tests/guards/action-label-vocabulary.test.ts (BAN side)
 *   - src/components/ui/button-variants.ts (the variant catalogue)
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src/app", "src/components"];

const EXEMPT_DIR_NAMES = new Set<string>([
    "node_modules",
    "__tests__",
    "__mocks__",
]);
const EXEMPT_FILE_PATTERNS: RegExp[] = [
    /\.test\.tsx?$/,
    /\.spec\.tsx?$/,
    /\.stories\.tsx?$/,
];

interface Hit {
    file: string;
    line: number;
    text: string;
    issue: string;
}

function walk(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full);
        const segments = rel.split(path.sep);
        if (segments.some((s) => EXEMPT_DIR_NAMES.has(s))) continue;
        if (EXEMPT_FILE_PATTERNS.some((rx) => rx.test(rel))) continue;
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

/**
 * Scan a single line for a `<Button>+ Word</Button>` pattern (or
 * `<button className={buttonVariants(...)}>+ Word</button>`). Returns
 * the position of the start tag in the line if matched, plus the
 * full attribute substring of that tag.
 */
function findCreateButton(
    line: string,
):
    | { tagAttrs: string; afterText: string }
    | null {
    // Match `<Button` or `<button ... className={buttonVariants(...)}>`
    // followed (within the same line) by a `+ <Word>` literal.
    const m = line.match(
        /<([Bb]utton)(\s+[^>]*?)?>(?:\s*)\+\s+[A-Z][A-Za-z]*\b/,
    );
    if (!m) return null;
    return {
        tagAttrs: m[2] ?? "",
        afterText: line.slice(m.index! + m[0].length),
    };
}

describe("v2-fu-2 create-button uniformity", () => {
    it("zero `+ X` buttons declare a non-primary variant", () => {
        const offenders: Hit[] = [];
        for (const dir of SCAN_DIRS) {
            for (const file of walk(path.join(ROOT, dir))) {
                const content = fs.readFileSync(file, "utf8");
                const lines = content.split("\n");
                lines.forEach((line, i) => {
                    const trimmed = line.trim();
                    if (
                        trimmed.startsWith("//") ||
                        trimmed.startsWith("*")
                    )
                        return;
                    const hit = findCreateButton(line);
                    if (!hit) return;
                    // If the start tag explicitly declares a non-
                    // primary variant, that's a violation. No
                    // declaration = default primary → OK.
                    const variantMatch = hit.tagAttrs.match(
                        /variant=["']([a-z-]+)["']/,
                    );
                    if (
                        variantMatch &&
                        variantMatch[1] !== "primary"
                    ) {
                        offenders.push({
                            file: path.relative(ROOT, file),
                            line: i + 1,
                            text: trimmed.slice(0, 200),
                            issue: `variant="${variantMatch[1]}" — must be variant="primary"`,
                        });
                    }
                });
            }
        }
        if (offenders.length > 0) {
            const sample = offenders
                .slice(0, 15)
                .map(
                    (o) =>
                        `  ${o.file}:${o.line}  [${o.issue}]\n    ${o.text}`,
                )
                .join("\n");
            throw new Error(
                `Found ${offenders.length} create-button(s) with non-primary variant. The '+' glyph must render uniformly white-on-brand across every create button — keep the variant locked to 'primary'.\n\nFirst ${Math.min(15, offenders.length)} offender(s):\n${sample}`,
            );
        }
        expect(offenders).toHaveLength(0);
    });

    it("zero `+ X` buttons declare size='sm' or size='xs'", () => {
        const offenders: Hit[] = [];
        for (const dir of SCAN_DIRS) {
            for (const file of walk(path.join(ROOT, dir))) {
                const content = fs.readFileSync(file, "utf8");
                const lines = content.split("\n");
                lines.forEach((line, i) => {
                    const trimmed = line.trim();
                    if (
                        trimmed.startsWith("//") ||
                        trimmed.startsWith("*")
                    )
                        return;
                    const hit = findCreateButton(line);
                    if (!hit) return;
                    const sizeMatch = hit.tagAttrs.match(
                        /size=["'](xs|sm)["']/,
                    );
                    if (sizeMatch) {
                        offenders.push({
                            file: path.relative(ROOT, file),
                            line: i + 1,
                            text: trimmed.slice(0, 200),
                            issue: `size="${sizeMatch[1]}" — drop the prop (default 'md' is the canonical pill height)`,
                        });
                    }
                });
            }
        }
        if (offenders.length > 0) {
            const sample = offenders
                .slice(0, 15)
                .map(
                    (o) =>
                        `  ${o.file}:${o.line}  [${o.issue}]\n    ${o.text}`,
                )
                .join("\n");
            throw new Error(
                `Found ${offenders.length} create-button(s) with size='xs' or 'sm'. Pill height must be uniform — drop the prop so the default 'md' (h-9) applies.\n\nFirst ${Math.min(15, offenders.length)} offender(s):\n${sample}`,
            );
        }
        expect(offenders).toHaveLength(0);
    });
});
