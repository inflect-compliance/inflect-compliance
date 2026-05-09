/**
 * Action label vocabulary ratchet.
 *
 * Original PR-5 (2026-05-08) banned the `+ ` prefix on action button
 * labels — the audit's call at the time was that the `+` belonged in
 * the button's `icon` slot, not in the text.
 *
 * v2-fu-2 (2026-05-09) REVERSES this rule. The new convention:
 *
 *   Every "create" button reads literally `+ <Singular Noun>`.
 *   Examples: `+ Control`, `+ Risk`, `+ Audit`, `+ Audit Cycle`.
 *
 * Why the reversal:
 *   - Linear, Notion, Vercel all use the literal `+ X` shape. The `+`
 *     IS the icon — readable, terse, instantly scannable.
 *   - Separating icon (Plus component) from text added visual noise:
 *     two distinct elements competing where one literal character
 *     reads as a single glyph.
 *   - The verb-vocabulary (`Create | Add | Link`) became a debate at
 *     every PR. `+ X` is one rule that fits every create case.
 *
 * What this ratchet now bans
 *   1. `<Button>` text or i18n button values that start with one of
 *      `New <Word>` / `Add <Word>` / `Create <Word>`. The legacy verbs
 *      are retired.
 *   2. Banner-icon-emoji prefixes on i18n values (`➕ Add Risk`).
 *
 * What this ratchet now REQUIRES
 *   The companion ratchet at
 *   `tests/guards/create-button-naming.test.ts` enforces the
 *   positive `+ <Word>` shape on buttons that match the create-action
 *   pattern. This file owns the BAN side; that file owns the
 *   REQUIRE side.
 *
 * Pairs with:
 *   - tests/guards/create-button-naming.test.ts
 *   - tests/guards/header-button-size.test.ts
 *   - docs/design-system.md (button section)
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src/app", "src/components"];
const I18N_DIR = "messages";

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

// Files where the legacy verbs appear in CONTENT (e.g. educational
// strings, "Create a new..." help text in body copy). These don't
// render as button labels — exempt.
const EXEMPT_FILES = new Set<string>([
    // Generic "Create new option…" inside Combobox
    "src/components/ui/combobox.tsx",
    // SCIM provisioning copy describes the IdP's actions ("Create
    // Users", "Update User Attributes") — not button labels.
    "src/app/t/[tenantSlug]/(app)/admin/scim/page.tsx",
    // Onboarding prose
    "src/components/onboarding/OnboardingWizard.tsx",
]);

// JSX text shaped like a BUTTON label that starts with the legacy
// verbs. The match requires `>` (open of JSX text) on the left and a
// capitalised word after the verb on the right. We additionally
// require the line to contain `<Button` / `<button` / `<Link...
// buttonVariants` so headings (`<Heading>Create API Key</Heading>`)
// and other JSX text don't false-positive.
const JSX_LEGACY_VERB_RE = />\s*(New|Add|Create)\s+[A-Z]/;
const JSX_BUTTON_CONTEXT_RE = /<[Bb]utton\b|buttonVariants/;

// i18n values that start with the legacy verbs OR with a banner emoji
// like ➕ ✓ AND are followed by a TERSE noun phrase (1–3 Capitalised
// Words). Body copy like "Create your organization", "Add your first
// asset above", "Create a custom risk with..." doesn't match — those
// are sentences, not button labels.
const I18N_LEGACY_VERB_RE =
    /:\s*"\s*(?:[➕✓✚📎🔍📄]\s*)?(New|Add|Create)\s+(?:[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,2})\s*"/;

// i18n values that ONLY have a leading emoji prefix (e.g. `📎 Add
// Evidence`). The regex above already catches these via the verb
// match, but we keep this for documentation purposes.

interface Hit {
    file: string;
    line: number;
    text: string;
}

function walk(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full);
        if (EXEMPT_FILES.has(rel)) continue;
        const segments = rel.split(path.sep);
        if (segments.some((s) => EXEMPT_DIR_NAMES.has(s))) continue;
        if (EXEMPT_FILE_PATTERNS.some((rx) => rx.test(rel))) continue;
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

describe("Action label vocabulary (v2-fu-2)", () => {
    it("zero legacy `(New|Add|Create) Word` JSX text labels", () => {
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
                    if (!JSX_LEGACY_VERB_RE.test(line)) return;
                    // Skip if the line isn't a button-context (e.g.
                    // `<Heading>Create API Key</Heading>` is a page
                    // title, not a button label).
                    if (!JSX_BUTTON_CONTEXT_RE.test(line)) return;
                    offenders.push({
                        file: path.relative(ROOT, file),
                        line: i + 1,
                        text: trimmed.slice(0, 200),
                    });
                });
            }
        }
        if (offenders.length > 0) {
            const sample = offenders
                .slice(0, 15)
                .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
                .join("\n");
            throw new Error(
                `Found ${offenders.length} legacy create-button label(s) starting with 'New X' / 'Add X' / 'Create X'.\n\nv2-fu-2 convention: every create button reads literally '+ <Singular Noun>' — e.g. '+ Control', '+ Risk', '+ Audit'. The '+' IS the icon.\n\nFirst ${Math.min(15, offenders.length)} offender(s):\n${sample}`,
            );
        }
        expect(offenders).toHaveLength(0);
    });

    it("zero legacy i18n button values starting with `(New|Add|Create) X`", () => {
        const offenders: Hit[] = [];
        const i18nDir = path.join(ROOT, I18N_DIR);
        if (!fs.existsSync(i18nDir)) return;
        // Auth / registration form submits don't follow the `+ X`
        // convention — "Create Account" is the canonical pattern for
        // signup forms. Other locales add their equivalents here.
        const I18N_KEY_EXEMPT = new Set<string>([
            // Auth / registration form submits don't follow `+ X`
            // — "Create Account" is the canonical signup pattern.
            "submitRegister",
            // Page-title strings (rendered as `<Heading level={1}>`,
            // not as button text). Headings retain the descriptive
            // verb form ("New Risk" reads as the page about a new
            // risk).
            "newRiskTitle",
        ]);
        for (const file of fs.readdirSync(i18nDir)) {
            if (!file.endsWith(".json")) continue;
            const abs = path.join(i18nDir, file);
            const content = fs.readFileSync(abs, "utf8");
            const lines = content.split("\n");
            lines.forEach((line, i) => {
                if (!I18N_LEGACY_VERB_RE.test(line)) return;
                const keyMatch = line.match(/"([a-zA-Z0-9_]+)"\s*:/);
                if (keyMatch && I18N_KEY_EXEMPT.has(keyMatch[1])) return;
                offenders.push({
                    file: path.relative(ROOT, abs),
                    line: i + 1,
                    text: line.trim().slice(0, 200),
                });
            });
        }
        if (offenders.length > 0) {
            const sample = offenders
                .slice(0, 15)
                .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
                .join("\n");
            throw new Error(
                `Found ${offenders.length} legacy i18n button value(s). Migrate the value to '+ <Noun>' shape — e.g. '"newRisk": "+ Risk"', '"createAudit": "+ Audit"'. Drop any leading emoji icon.\n\nFirst ${Math.min(15, offenders.length)} offender(s):\n${sample}`,
            );
        }
        expect(offenders).toHaveLength(0);
    });
});
