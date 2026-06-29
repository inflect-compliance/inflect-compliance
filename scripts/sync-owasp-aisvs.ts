/**
 * sync-owasp-aisvs — re-derive the AISVS v1.0 ID/level INDEX from the upstream
 * OWASP markdown and report drift against the committed framework library.
 *
 * LICENSE NOTE (CC-BY-SA-4.0): this script deliberately extracts ONLY the
 * canonical requirement IDs and verification levels (L1/L2/L3) — facts, not
 * copyrightable prose. It NEVER writes the upstream requirement text into the
 * repo. The short PARAPHRASED titles in the library yaml are authored by hand
 * (see scratchpad gen-aisvs.js / the committed yaml); when this script reports
 * an upstream change, a maintainer updates those paraphrases manually and
 * regenerates the yaml. This keeps src/data/libraries/owasp-aisvs-1.0.yaml a
 * reference index, not a derivative copy.
 *
 * Usage:
 *   npx tsx scripts/sync-owasp-aisvs.ts          # report drift (exit 1 if any)
 *
 * Network is required (fetches raw.githubusercontent.com). Run manually, not
 * in CI — the committed yaml is the source of truth that CI validates.
 */
import * as path from 'node:path';
import { parseLibraryFile, loadLibrary } from '@/app-layer/libraries';

const RAW_BASE = 'https://raw.githubusercontent.com/OWASP/AISVS/master/1.0/en';

const CHAPTER_FILES: Array<{ ch: number; file: string }> = [
    { ch: 1, file: '0x10-C01-Training-Data-Integrity-and-Traceability.md' },
    { ch: 2, file: '0x10-C02-Input-Validation.md' },
    { ch: 3, file: '0x10-C03-Model-Lifecycle-Management.md' },
    { ch: 4, file: '0x10-C04-Infrastructure.md' },
    { ch: 5, file: '0x10-C05-Access-Control-and-Identity.md' },
    { ch: 6, file: '0x10-C06-Supply-Chain.md' },
    { ch: 7, file: '0x10-C07-Model-Behavior.md' },
    { ch: 8, file: '0x10-C08-Memory-Embeddings-and-Vector-Database.md' },
    { ch: 9, file: '0x10-C09-Orchestration-and-Agentic-Action.md' },
    { ch: 10, file: '0x10-C10-MCP-Security.md' },
    { ch: 11, file: '0x10-C11-Adversarial-Robustness.md' },
    { ch: 12, file: '0x10-C12-Monitoring-and-Logging.md' },
];

/** Extract { id -> level } from one chapter's markdown requirement tables. */
function parseChapter(ch: number, md: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const rawLine of md.split('\n')) {
        const line = rawLine.trim();
        // Requirement rows live in markdown tables: | <id> | <text> | <Lx> | ... |
        if (!line.startsWith('|')) continue;
        // ID is either "C<ch>.<sec>.<req>" or bare "<ch>.<sec>.<req>".
        const idMatch = line.match(/\b(?:C)?(\d+\.\d+\.\d+)\b/);
        if (!idMatch) continue;
        const numeric = idMatch[1];
        // Only rows whose id belongs to THIS chapter (defends against stray
        // cross-references in prose tables).
        if (!numeric.startsWith(`${ch}.`)) continue;
        const levelMatch = line.match(/\bL([123])\b/);
        if (!levelMatch) continue;
        out.set(`C${numeric}`, `L${levelMatch[1]}`);
    }
    return out;
}

/** Read the committed yaml's assessable { id -> level } (level from annotation). */
function loadCommittedIndex(): Map<string, string> {
    const p = path.resolve(__dirname, '../src/data/libraries/owasp-aisvs-1.0.yaml');
    const lib = loadLibrary(parseLibraryFile(p), 'aisvs');
    const out = new Map<string, string>();
    for (const n of lib.framework.nodes) {
        if (!n.assessable) continue;
        const lv = (n.annotation ?? '').match(/Level:\s*(L[123])/)?.[1] ?? '?';
        out.set(n.refId, lv);
    }
    return out;
}

async function main() {
    const upstream = new Map<string, string>();
    for (const c of CHAPTER_FILES) {
        const url = `${RAW_BASE}/${c.file}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`✗ fetch failed ${res.status} ${url}`);
            process.exit(2);
        }
        const md = await res.text();
        const chMap = parseChapter(c.ch, md);
        for (const [id, lv] of chMap) upstream.set(id, lv);
        console.log(`  C${c.ch}: ${chMap.size} requirements`);
    }

    const committed = loadCommittedIndex();
    console.log(`\nupstream=${upstream.size} committed=${committed.size}`);

    const added: string[] = [];
    const levelChanged: string[] = [];
    for (const [id, lv] of upstream) {
        if (!committed.has(id)) added.push(`${id} (${lv})`);
        else if (committed.get(id) !== lv) levelChanged.push(`${id}: ${committed.get(id)} → ${lv}`);
    }
    const removed: string[] = [];
    for (const id of committed.keys()) if (!upstream.has(id)) removed.push(id);

    const drift = added.length + removed.length + levelChanged.length;
    if (drift === 0) {
        console.log('\n✅ In sync — committed index matches upstream AISVS IDs + levels.');
        process.exit(0);
    }
    console.log('\n⚠️  Drift detected — update the paraphrased index + regenerate the yaml:');
    if (added.length) console.log(`  NEW upstream (add paraphrase): ${added.join(', ')}`);
    if (removed.length) console.log(`  REMOVED upstream (drop): ${removed.join(', ')}`);
    if (levelChanged.length) console.log(`  LEVEL changed: ${levelChanged.join(', ')}`);
    console.log(
        '\nNote: this tool only re-derives IDs + levels. Author the short ' +
        'paraphrased titles by hand (never paste upstream prose), then ' +
        'regenerate src/data/libraries/owasp-aisvs-1.0.yaml.',
    );
    process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});
