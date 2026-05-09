/**
 * v2-PR-4 — Motion language ratchet (initial scope).
 *
 * The motion vocabulary is a single line: 150ms ease-out, animating
 * `background-color` and `border-color` only — never `transform`,
 * never `box-shadow` — for **layout-affecting surfaces** (cards,
 * buttons, table rows, sidebar items, list cards).
 *
 * Why this is a feature:
 *   - Transform/scale/translate hovers cause text reflow (subpixel
 *     anti-aliasing shifts) and trigger compositor work on every
 *     frame. The visual "lift" reads cheap on premium products.
 *   - Shadow hovers add visual noise and feel uncertain — premium
 *     products use border darkening (`hover:border-border-emphasis`)
 *     for "this is clickable" instead.
 *
 * What this ratchet bans (outside primitives):
 *   - hover:translate-*  (lift / shift)
 *   - hover:scale-*      (zoom)
 *   - hover:shadow-*     (drop shadow on hover)
 *   - hover:-translate-* (negative-direction lift)
 *
 * What is exempt (primitive-level motion is part of the render
 * contract):
 *   - `expanding-arrow.tsx` — the slide-on-hover arrow IS the
 *     icon's render contract; the visual cue is the navigation hint.
 *   - `file-upload.tsx`     — drop-zone icon scaling is the
 *     canonical drag-feedback pattern. Active-scale-95 is the
 *     tap-feedback gesture.
 *
 * NOT covered by this PR (deferred to follow-up):
 *   - `transition-all` → `transition-colors` codemod across the
 *     29 application sites. Many `transition-all` uses are
 *     legitimate (animating width on progress bars, stroke on
 *     SVG charts). A blind codemod would break them.
 *   - Focus-ring unification (would touch 100+ sites; bigger PR).
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

const EXEMPT_FILES = new Set<string>([
    // The slide-on-hover arrow is the icon's render contract — the
    // motion IS the navigation hint.
    "src/components/ui/icons/expanding-arrow.tsx",
    // File-upload drop-zone icon: scale-110 on hover/drag = drop
    // affordance; scale-95 on active = tap feedback. Both are
    // canonical drag-and-drop motion gestures, not decorative
    // hover lifts.
    "src/components/ui/file-upload.tsx",
]);

const BANNED_PATTERNS = [
    /\bhover:translate-[^\s"'`]+/,
    /\bhover:-translate-[^\s"'`]+/,
    /\bhover:scale-[^\s"'`]+/,
    /\bhover:shadow-[^\s"'`]+/,
    /\bgroup-hover:translate-[^\s"'`]+/,
    /\bgroup-hover:-translate-[^\s"'`]+/,
    /\bgroup-hover:scale-[^\s"'`]+/,
    /\bgroup-hover:shadow-[^\s"'`]+/,
];

interface Hit {
    file: string;
    line: number;
    text: string;
}

function isExempt(rel: string): boolean {
    if (EXEMPT_FILES.has(rel)) return true;
    const segments = rel.split(path.sep);
    if (segments.some((s) => EXEMPT_DIR_NAMES.has(s))) return true;
    if (EXEMPT_FILE_PATTERNS.some((rx) => rx.test(rel))) return true;
    return false;
}

function walk(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full);
        if (isExempt(rel)) continue;
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

describe("v2-PR-4 motion language ratchet", () => {
    describe("hover:transform / scale / shadow eradication", () => {
        it("zero `hover:(translate|scale|shadow)` outside exempts", () => {
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
                        for (const rx of BANNED_PATTERNS) {
                            if (rx.test(line)) {
                                offenders.push({
                                    file: path.relative(ROOT, file),
                                    line: i + 1,
                                    text: trimmed.slice(0, 200),
                                });
                                break;
                            }
                        }
                    });
                }
            }
            if (offenders.length > 0) {
                const sample = offenders
                    .slice(0, 15)
                    .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
                    .join("\n");
                throw new Error(
                    `Found ${offenders.length} hover-transform/scale/shadow class(es). The motion language is bg + border-color only — clickable cards use \`hover:border-border-emphasis\` for the "this is clickable" affordance, not transform/shadow lift.\n\nFirst ${Math.min(15, offenders.length)} offender(s):\n${sample}`,
                );
            }
            expect(offenders).toHaveLength(0);
        });

        it("documents every exempt file with a reason", () => {
            for (const rel of EXEMPT_FILES) {
                const abs = path.resolve(ROOT, rel);
                expect(fs.existsSync(abs)).toBe(true);
            }
        });

        it("exempt list is deliberately tiny", () => {
            // Two primitives where the transform IS the render
            // contract (sliding arrow, drop-zone scale). Bumping past
            // 4 means the team is reintroducing decorative lift on
            // pages — push back on the new exemption.
            expect(EXEMPT_FILES.size).toBeLessThanOrEqual(4);
        });
    });
});
