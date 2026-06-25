#!/usr/bin/env node
/**
 * Vendor the three Swagger-UI assets from `swagger-ui-dist` into
 * `public/swagger-ui/` so `/api/docs` can self-host them instead of
 * loading from the jsdelivr CDN.
 *
 * Why self-host:
 *   - CSP: a strict policy needs only `'self'` for script/style/img;
 *     no `cdn.jsdelivr.net` allowance, no `frame-src` workaround.
 *   - Supply chain: the assets are pinned to the locked
 *     `swagger-ui-dist` version, not whatever the CDN serves.
 *   - Air-gapped: dev/staging behind a firewall work with no egress.
 *
 * Why plain Node (.cjs), not tsx:
 *   - Runs from `postinstall`, where the only guaranteed runtime is
 *     `node`. In a production install (`npm ci --omit=dev`) neither
 *     `tsx` nor `swagger-ui-dist` is present — this script then SKIPS
 *     cleanly (exit 0). That's correct: `/api/docs` is 404 in
 *     production anyway (see src/app/api/docs/route.ts), so the assets
 *     aren't needed there.
 *
 * Idempotent: overwrites the three files on every run. Safe to call
 * from postinstall AND manually via `npm run swagger-ui:vendor`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = [
    'swagger-ui.css',
    'swagger-ui-bundle.js',
    'swagger-ui-standalone-preset.js',
];

function main() {
    const repoRoot = path.resolve(__dirname, '..');
    const srcDir = path.join(repoRoot, 'node_modules', 'swagger-ui-dist');
    const destDir = path.join(repoRoot, 'public', 'swagger-ui');

    if (!fs.existsSync(srcDir)) {
        // Production install (--omit=dev) or a checkout without deps.
        // /api/docs is 404 in production, so this is a no-op, not an error.
        console.log(
            '[copy-swagger-ui] swagger-ui-dist not installed — skipping ' +
                '(expected in production --omit=dev installs).',
        );
        return;
    }

    fs.mkdirSync(destDir, { recursive: true });

    let copied = 0;
    for (const asset of ASSETS) {
        const src = path.join(srcDir, asset);
        const dest = path.join(destDir, asset);
        if (!fs.existsSync(src)) {
            console.error(`[copy-swagger-ui] MISSING source asset: ${asset}`);
            process.exitCode = 1;
            continue;
        }
        fs.copyFileSync(src, dest);
        copied++;
    }
    console.log(`[copy-swagger-ui] vendored ${copied}/${ASSETS.length} assets → public/swagger-ui/`);
}

main();
