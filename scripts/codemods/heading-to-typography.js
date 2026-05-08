#!/usr/bin/env node
/**
 * PR-3 codemod — migrate inline `<hN className="...">` headings to the
 * `<Heading>` / `<Eyebrow>` typography primitives.
 *
 *   node scripts/codemods/heading-to-typography.js          # apply
 *   node scripts/codemods/heading-to-typography.js --dry    # report only
 *
 * Patterns detected (in priority order — eyebrow first because it has
 * the most-specific class signature):
 *
 *   `text-xs ... uppercase tracking-wider ... text-content-muted`
 *      ─→ <Eyebrow>...</Eyebrow>
 *
 *   tag=h1 + (`text-2xl font-bold` OR `text-2xl font-semibold`)
 *      ─→ <Heading level={1}>...</Heading>
 *
 *   tag=h2 + `text-lg font-semibold`
 *      ─→ <Heading level={2}>...</Heading>
 *
 *   tag=h3 + `text-sm font-semibold`
 *      ─→ <Heading level={3}>...</Heading>
 *
 * Tokens that the `<Heading>` primitive owns by default (size, weight,
 * `text-content-emphasis` colour, `tracking-tight` on L1) are stripped
 * from the className; any non-canonical extras (margins, flex utilities,
 * id-prefixed selectors, etc.) are preserved via a `className=` prop on
 * the migrated element.
 *
 * Excluded:
 *   - the layout shells (`EntityListPage`, `EntityDetailLayout`,
 *     `ListPageShell`) and the `typography.tsx` file itself — those are
 *     the canonical sites of the new primitives.
 *   - test / spec / stories files.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const TARGETS = ["src/app", "src/components"];

const EXCLUDE_DIR_NAMES = new Set(["node_modules", "__tests__", "__mocks__"]);
const EXCLUDE_FILE_PATTERNS = [
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\.stories\.tsx?$/,
];

const SHELL_FILES = new Set([
  "src/components/layout/EntityListPage.tsx",
  "src/components/layout/EntityDetailLayout.tsx",
  "src/components/layout/ListPageShell.tsx",
  "src/components/ui/typography.tsx",
]);

const DRY = process.argv.includes("--dry");

const HEADING_TOKENS_TO_STRIP = new Set([
  // Sizes
  "text-2xl",
  "text-xl",
  "text-lg",
  "text-base",
  "text-sm",
  "text-xs",
  // Weights
  "font-bold",
  "font-semibold",
  "font-medium",
  // Default colour (Heading primitive defaults to text-content-emphasis)
  "text-content-emphasis",
  "text-content-default",
  // L1 default tracking
  "tracking-tight",
  // Eyebrow tokens (consumed by <Eyebrow>)
  "uppercase",
  "tracking-wider",
  "text-content-muted",
]);

function classifyClasses(classList) {
  const set = new Set(classList);
  // Skip if the heading uses a tone the primitive doesn't expose
  // by default (e.g. text-content-warning for warning panels). Those
  // need hand-migration to use the `tone` prop or a passthrough.
  if (
    set.has("text-content-warning") ||
    set.has("text-content-error") ||
    set.has("text-content-success") ||
    set.has("text-content-info") ||
    set.has("text-content-subtle") ||
    set.has("text-gray-900") ||
    set.has("text-white") ||
    set.has("text-gray-700")
  ) {
    return null;
  }
  // Eyebrow signature — combination of all four tokens (or just the
  // text-xs uppercase tracking-wider trio with the muted colour).
  if (
    set.has("text-xs") &&
    set.has("uppercase") &&
    set.has("tracking-wider") &&
    (set.has("text-content-muted") || set.has("font-semibold"))
  ) {
    return { component: "Eyebrow" };
  }
  // Level 1 — text-2xl OR text-xl.
  // text-xl headings are upgraded to L1's text-2xl on purpose: PR-3
  // codifies a single canonical page-title size, and the slight visual
  // scale-up is the deliberate design move.
  if (set.has("text-2xl") || set.has("text-xl")) {
    return { component: "Heading", level: 1 };
  }
  // Level 2 — text-lg or text-base with a heading-shaped weight.
  if (
    (set.has("text-lg") || set.has("text-base")) &&
    (set.has("font-semibold") || set.has("font-bold") || set.has("font-medium"))
  ) {
    return { component: "Heading", level: 2 };
  }
  // Level 3 — text-sm with a heading-shaped weight.
  if (
    set.has("text-sm") &&
    (set.has("font-semibold") || set.has("font-bold") || set.has("font-medium"))
  ) {
    return { component: "Heading", level: 3 };
  }
  // Level 3 fallback — `font-semibold` with no explicit size becomes a
  // level-3 default-sized heading. (Common pattern in card titles.)
  if (set.has("font-semibold") && !hasSizeToken(set)) {
    return { component: "Heading", level: 3 };
  }
  return null;
}

function hasSizeToken(set) {
  return (
    set.has("text-2xl") ||
    set.has("text-xl") ||
    set.has("text-lg") ||
    set.has("text-base") ||
    set.has("text-sm") ||
    set.has("text-xs")
  );
}

// `<hN ...><children></hN>` on a single line, with a static className.
// Multi-line headings handled in the manual sweep.
const HEADING_RE =
  /<h([1-6])\s+([^>]*?)className="([^"]+?)"([^>]*?)>([\s\S]*?)<\/h\1>/g;

function transformHeadings(content) {
  let count = 0;
  content = content.replace(
    HEADING_RE,
    (match, levelStr, beforeAttrs, classNameValue, afterAttrs, children) => {
      const tagLevel = parseInt(levelStr, 10);
      const classList = classNameValue.split(/\s+/).filter(Boolean);
      const classification = classifyClasses(classList);
      if (!classification) return match;

      // Cross-check: tag level should match the visual level for
      // headings, MOSTLY. Allow:
      //   - tag level >= visual level (e.g. <h2> visually styled at
      //     L3 size — common for sub-section panels nested under
      //     a higher-tier page title)
      //   - tag level <= visual level when migrating up (e.g. <h2>
      //     styled like a page title because the page lacked a real H1)
      // Reject cases where the gap is more than 1 level (e.g. <h4>
      // styled at L1) — those are weird outliers worth a human look.
      if (
        classification.component === "Heading" &&
        Math.abs(classification.level - tagLevel) > 1
      ) {
        return match;
      }

      // Strip primitive-owned tokens from the className; keep the rest.
      const remaining = classList
        .filter((c) => !HEADING_TOKENS_TO_STRIP.has(c))
        .join(" ");

      const otherAttrs = (beforeAttrs.trim() + " " + afterAttrs.trim()).trim();
      const otherAttrsStr = otherAttrs ? ` ${otherAttrs}` : "";
      const classNameProp = remaining ? ` className="${remaining}"` : "";

      count++;
      if (classification.component === "Eyebrow") {
        return `<Eyebrow${classNameProp}${otherAttrsStr}>${children}</Eyebrow>`;
      }
      const levelProp = ` level={${classification.level}}`;
      return `<Heading${levelProp}${classNameProp}${otherAttrsStr}>${children}</Heading>`;
    },
  );
  return { content, count };
}

// ── Import management ────────────────────────────────────────────────

function ensureTypographyImport(content) {
  const needsHeading = /<Heading\b/.test(content);
  const needsEyebrow = /<Eyebrow\b/.test(content);
  if (!needsHeading && !needsEyebrow) return { content, added: false };
  const existingRe =
    /import\s+\{([^}]*)\}\s+from\s+['"]@\/components\/ui\/typography['"]\s*;?/;
  const required = [];
  if (needsHeading) required.push("Heading");
  if (needsEyebrow) required.push("Eyebrow");
  const existingMatch = content.match(existingRe);
  if (existingMatch) {
    const existing = existingMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const missing = required.filter((r) => !existing.includes(r));
    if (missing.length === 0) return { content, added: false };
    const merged = [...existing, ...missing].join(", ");
    return {
      content: content.replace(
        existingRe,
        `import { ${merged} } from '@/components/ui/typography';`,
      ),
      added: true,
    };
  }
  const importLine = `import { ${required.join(", ")} } from '@/components/ui/typography';\n`;
  // Insert after the last top-level import (handles multi-line imports).
  const lines = content.split("\n");
  let lastImportEnd = -1;
  let depth = 0;
  let inImportBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (depth === 0) {
      if (trimmed.startsWith("import ") || trimmed.startsWith("import{")) {
        inImportBlock = true;
      } else if (
        trimmed.startsWith("'use ") ||
        trimmed.startsWith('"use ') ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed === ""
      ) {
        // skip
      } else if (inImportBlock) {
        break;
      }
    }
    if (inImportBlock) {
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (depth === 0 && /;\s*$/.test(trimmed)) {
        lastImportEnd = i;
      }
    }
  }
  if (lastImportEnd >= 0) {
    lines.splice(lastImportEnd + 1, 0, importLine.trimEnd());
  } else if (lines[0] && /^['"]use\s+\w+['"]\s*;?\s*$/.test(lines[0].trim())) {
    lines.splice(1, 0, importLine.trimEnd());
  } else {
    lines.unshift(importLine.trimEnd());
  }
  return { content: lines.join("\n"), added: true };
}

function isExcluded(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (SHELL_FILES.has(rel)) return true;
  const segments = rel.split(path.sep);
  if (segments.some((s) => EXCLUDE_DIR_NAMES.has(s))) return true;
  if (EXCLUDE_FILE_PATTERNS.some((rx) => rx.test(rel))) return true;
  return false;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isExcluded(full)) continue;
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function main() {
  const files = TARGETS.flatMap((t) => walk(path.join(ROOT, t)));
  let totalFiles = 0;
  let totalReplacements = 0;
  let importsAdded = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    let working = before;
    const c1 = transformHeadings(working);
    working = c1.content;
    let changed = c1.count;
    if (changed > 0) {
      const c2 = ensureTypographyImport(working);
      working = c2.content;
      if (c2.added) importsAdded++;
    }
    if (changed > 0 && working !== before) {
      totalFiles++;
      totalReplacements += changed;
      if (!DRY) fs.writeFileSync(file, working);
      const rel = path.relative(ROOT, file);
      console.log(`${changed.toString().padStart(4)}  ${rel}`);
    }
  }
  console.log(
    `\n${DRY ? "[dry-run]" : "[applied]"} ${totalReplacements} replacement(s) across ${totalFiles} file(s); ${importsAdded} import(s) added.`,
  );
}

main();
