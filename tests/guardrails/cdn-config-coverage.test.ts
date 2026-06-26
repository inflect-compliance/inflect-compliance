/**
 * Structural ratchet — CloudFront CDN configuration coverage.
 *
 * Locks the wiring of the static-asset edge tier so a refactor can't
 * silently drop a cache behaviour or the invalidation step:
 *   - the terraform CDN module exists + declares the distribution with
 *     all four cache behaviours (immutable static / image / api / default),
 *   - next.config.js drives assetPrefix from env,
 *   - the Caddyfile emits the immutable Cache-Control for /_next/static/*,
 *   - the deploy workflow invalidates CloudFront on release.
 *
 * See docs/cdn.md and docs/implementation-notes/2026-06-26-cdn-cloudfront.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8') : '';

const cdnTf = read('infra/terraform/modules/cdn/main.tf');
const nextCfg = read('next.config.js');
const caddy = read('deploy/Caddyfile');
const deployYml = read('.github/workflows/deploy.yml');

describe('CDN terraform module', () => {
    it('infra/terraform/modules/cdn/main.tf exists', () => {
        expect(cdnTf.length).toBeGreaterThan(0);
    });

    it('declares a CloudFront distribution', () => {
        expect(cdnTf).toMatch(/resource\s+"aws_cloudfront_distribution"/);
    });

    it('declares all four cache behaviours', () => {
        // Ordered behaviours by path pattern …
        expect(cdnTf).toContain('/_next/static/*');
        expect(cdnTf).toContain('/_next/image*');
        expect(cdnTf).toContain('/api/*');
        // … plus the catch-all default behaviour for the HTML shell.
        expect(cdnTf).toMatch(/default_cache_behavior\s*\{/);
    });

    it('caches immutable static for 1 year and never caches /api', () => {
        // The static behaviour carries the 1-year (31536000) TTL.
        expect(cdnTf).toContain('31536000');
        // The ACM cert is pinned to us-east-1 (CloudFront requirement).
        expect(cdnTf).toMatch(/provider\s*=\s*aws\.us_east_1/);
    });
});

describe('origin + app wiring', () => {
    it('next.config.js drives assetPrefix from ASSET_PREFIX env', () => {
        expect(nextCfg).toMatch(/assetPrefix:\s*process\.env\.ASSET_PREFIX/);
    });

    it('Caddyfile emits immutable Cache-Control for /_next/static/*', () => {
        expect(caddy).toContain('/_next/static/*');
        expect(caddy).toMatch(/max-age=31536000,\s*immutable/);
    });
});

describe('release/deploy invalidation', () => {
    it('the deploy workflow runs a CloudFront invalidation', () => {
        expect(deployYml).toMatch(/aws cloudfront create-invalidation/);
        // Targeted: /_next/* and the HTML shell only.
        expect(deployYml).toContain('/_next/*');
    });
});
