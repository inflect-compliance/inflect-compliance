/**
 * Generate the "imported" policy-template fixture from vendored CSV exports.
 *
 * Source: `prisma/fixtures/imported-policies-src/*.csv` — a GRC-tool policy
 * export (one policy per file; HTML in the "Content Editor Text" column).
 * Each export carries no licence/attribution metadata and no PII (contacts
 * are group names, e.g. "Group-Admin"; zero email addresses) — these are
 * generic security-policy templates.
 *
 * We port the CONTENT only, converting the (messy) HTML — fake bullets via
 * `<span style>•</span>`, block-wrapper `<b>`, `<br>` soup, empty `<p>` — into
 * CLEAN MARKDOWN, so the templates render through the exact same
 * markdown→styled→PDF pipeline as the rest of the library (readable +
 * print-friendly once instantiated). Output is a PINNED fixture
 * (`prisma/fixtures/policy-templates-imported.json`), the hermetic source of
 * truth for the seed.
 *
 * Run:  npx tsx scripts/import-policy-templates.ts
 * Re-sync: drop a fresh export into imported-policies-src/ and re-run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(__dirname, '../prisma/fixtures/imported-policies-src');
const FIXTURE_PATH = path.resolve(__dirname, '../prisma/fixtures/policy-templates-imported.json');

/** Minimal RFC4180 CSV parser (handles quoted fields + "" escapes). */
function parseCSV(text: string): string[][] {
    text = text.replace(/^﻿/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
            } else field += c;
        } else if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;|&lsquo;/g, "'")
        .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
        .replace(/&hellip;/g, '…').replace(/&#?[a-z0-9]+;/gi, ' ');
}

/** Convert the export's HTML body into clean Markdown. */
export function htmlPolicyToMarkdown(html: string): string {
    let s = html;
    // lists → markdown (ordered numbered, unordered dashes)
    s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
        let n = 0;
        return '\n' + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_mm, t: string) => { n++; return `${n}. ${t.trim()}\n`; }) + '\n';
    });
    s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner: string) =>
        '\n' + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_mm, t: string) => `- ${t.trim()}\n`) + '\n');
    s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t: string) => `- ${t.trim()}\n`);
    // headings
    s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t: string) => `\n\n# ${t.trim()}\n\n`);
    s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t: string) => `\n\n## ${t.trim()}\n\n`);
    s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t: string) => `\n\n### ${t.trim()}\n\n`);
    s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, t: string) => `\n\n#### ${t.trim()}\n\n`);
    // bold — only genuine short inline emphasis; block-wrapper <b> (the source
    // wraps whole paragraphs incl. <br>) → keep text, drop the markers.
    s = s.replace(/<(b|strong)>([\s\S]*?)<\/(b|strong)>/gi, (_m, _t1: string, inner: string) => {
        const plain = inner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (!plain) return '';
        if (/<br|<h[1-4]|<p|<li|<ul|<ol/i.test(inner) || plain.length > 100) return inner;
        return `**${plain}**`;
    });
    // breaks + paragraphs
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '');
    // unwrap spans (keep inner text)
    s = s.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    // strip remaining tags + any truncated/unclosed trailing tag fragment
    s = s.replace(/<[^>]+>/g, '').replace(/<\/?[a-z][^>]*$/i, '');
    s = decodeEntities(s);
    // fake bullets (•/◦/▪) at line start → markdown dash
    s = s.split('\n').map((line) => {
        const t = line.replace(/^\s+/, '');
        if (/^[•◦▪·‣]\s*/.test(t)) return '- ' + t.replace(/^[•◦▪·‣]\s*/, '').trimEnd();
        return line.trimEnd();
    }).join('\n');
    // kill stray bold markers, collapse blank lines
    s = s.replace(/\*\*\s*\*\*/g, '').replace(/^\s*\*\*\s*$/gm, '');
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s + '\n';
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/** Domain category = title minus the trailing document-class word. */
function categoryFor(name: string): string {
    return name.replace(/\s+(Policy|Procedure|Plan|Standard)$/i, '').trim() || name;
}

interface Tmpl {
    externalRef: string;
    title: string;
    category: string;
    language: string;
    contentType: 'MARKDOWN';
    contentText: string;
    tags: string;
    source: string;
    sourceVersion: string;
}

function main() {
    const importedAt = new Date().toISOString().slice(0, 10);
    const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.csv'));
    const byTitle = new Map<string, Tmpl>();

    for (const f of files) {
        const rows = parseCSV(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
        if (rows.length < 2) continue;
        const d = rows[1];
        const title = (d[0] || '').trim();
        if (!title) continue;
        const contentText = htmlPolicyToMarkdown(d[3] || '');
        if (contentText.trim().length < 150) {
            process.stderr.write(`skip ${f}: content too short\n`);
            continue;
        }
        const category = categoryFor(title);
        const tags = category.toLowerCase().split(/\s+/).filter(Boolean).join(',');
        const rec: Tmpl = {
            externalRef: slugify(title),
            title,
            category,
            language: 'en',
            contentType: 'MARKDOWN',
            contentText,
            tags,
            source: 'imported',
            sourceVersion: importedAt,
        };
        // Dedup by title — keep the longer body.
        const prev = byTitle.get(title);
        if (!prev || rec.contentText.length > prev.contentText.length) byTitle.set(title, rec);
    }

    const templates = [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
    const payload = {
        source: 'imported-policies-src (vendored GRC-tool CSV export)',
        sourceVersion: importedAt,
        note: 'Generic security-policy templates imported from a CSV export; HTML converted to clean Markdown. No upstream licence/attribution metadata was provided with the export; no PII present.',
        importedAt,
        templates,
    };
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(payload, null, 2) + '\n');
    process.stdout.write(`✅ wrote ${templates.length} imported policy templates → ${path.relative(process.cwd(), FIXTURE_PATH)}\n`);
}

if (require.main === module) {
    main();
}
