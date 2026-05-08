/**
 * PR-5 — Action label vocabulary ratchet.
 *
 * Bans `+ ` prefix on action button labels. The leading `+` was a
 * legacy "icon-as-text" pattern from before the `<Button icon=…>` slot
 * existed; PR-5 retired the 6 sites that still used it. The icon
 * belongs to the button's `icon` slot, not the text.
 *
 * Pairs with the canonical action vocabulary (Create / Add / Link)
 * documented in CLAUDE.md. The vocabulary is a CONVENTION, not a hard
 * rule — three verbs map to three intents:
 *
 *   - `Create {Entity}` — minting a new top-level entity
 *   - `Add {Entity}`    — inserting a child / attaching to a parent
 *   - `Link {Entity}`   — cross-entity association
 *
 * The ratchet enforces the structural rule (`+ ` prefix is banned)
 * because that's mechanically detectable; the verb-choice convention
 * is enforced by reviewer judgment.
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

// JSX text content shaped like a button label that starts with `+ `:
// `>+ Add<`, `>+ New Risk<`, etc. We require the `+` to be flanked by
// `>` (open of JSX text) on the left and a word character (the verb)
// on the right — that excludes mathematical / spread-operator
// occurrences and the whitespace-before-text variants.
const JSX_LEADING_PLUS_RE = />\s*\+\s+[A-Za-z]/;

// i18n value strings that start with `+ `: `"key": "+ New Risk"`. Same
// shape constraint — must be a value that begins with `+`-space-letter.
const I18N_LEADING_PLUS_RE = /:\s*"\s*\+\s+[A-Za-z][^"]*"/;

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

interface Hit {
  file: string;
  line: number;
  text: string;
}

describe("Action label vocabulary ratchet", () => {
  it("zero `+ ` JSX text labels in src/app + src/components", () => {
    const offenders: Hit[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");
        lines.forEach((line, i) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (JSX_LEADING_PLUS_RE.test(line)) {
            offenders.push({
              file: path.relative(ROOT, file),
              line: i + 1,
              text: trimmed,
            });
          }
        });
      }
    }
    if (offenders.length > 0) {
      const sample = offenders
        .slice(0, 10)
        .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} button label(s) starting with '+ '. The icon belongs to the button's \`icon\` slot, not the text.\n\nFirst ${Math.min(10, offenders.length)} offender(s):\n${sample}\n\nReplace '+ Add X' with 'Add X', '+ New X' with 'Create X' (or 'Add X'/'Link X' per the vocabulary), and put any leading icon in the \`icon={…}\` prop.`,
      );
    }
    expect(offenders).toHaveLength(0);
  });

  it("zero `+ ` i18n value strings in messages/", () => {
    const offenders: Hit[] = [];
    const i18nDir = path.join(ROOT, I18N_DIR);
    if (!fs.existsSync(i18nDir)) return;
    for (const file of fs.readdirSync(i18nDir)) {
      if (!file.endsWith(".json")) continue;
      const abs = path.join(i18nDir, file);
      const content = fs.readFileSync(abs, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (I18N_LEADING_PLUS_RE.test(line)) {
          offenders.push({
            file: path.relative(ROOT, abs),
            line: i + 1,
            text: line.trim(),
          });
        }
      });
    }
    if (offenders.length > 0) {
      const sample = offenders
        .slice(0, 10)
        .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} i18n value(s) starting with '+ '. Drop the leading '+' from the translation; the icon belongs to the button's \`icon\` slot.\n\nFirst ${Math.min(10, offenders.length)} offender(s):\n${sample}`,
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
