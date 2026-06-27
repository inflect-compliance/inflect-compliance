/**
 * Structural ratchet — Policy detail Mappings + Traceability tabs.
 *
 * Mirrors the Asset detail page's canonical Mappings + Traceability
 * tabs on the Policy detail page:
 *   - A `mappings` tab rendering `<InheritedMappingsPanel>` against the
 *     policy's `/policies/<id>/mappings` endpoint (framework coverage
 *     inherited from the policy's linked controls).
 *   - A `traceability` tab rendering the lazy-loaded
 *     `<PolicyTraceabilityPanel>` against `/policies/<id>/traceability`
 *     (linked controls + risks/assets inherited via them).
 *
 * Same shape as the other policy-detail adoption ratchets — one
 * canonical pattern, one place to update if the contract changes.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const POLICY_DETAIL = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx',
);
const source = readFileSync(POLICY_DETAIL, 'utf8');

describe('Policy detail — Mappings + Traceability tabs', () => {
    it('declares both tabs in the tab bar', () => {
        expect(source).toMatch(/key:\s*'mappings'[\s\S]{0,40}label:\s*'Mappings'/);
        expect(source).toMatch(/key:\s*'traceability'[\s\S]{0,40}label:\s*'Traceability'/);
    });

    it('widens the active-tab union to include mappings + traceability', () => {
        expect(source).toMatch(/'mappings'\s*\|\s*'traceability'/);
    });

    it('renders InheritedMappingsPanel against the policy mappings endpoint', () => {
        expect(source).toMatch(
            /import\s*\{[^}]*\bInheritedMappingsPanel\b[^}]*\}\s*from\s*['"]@\/components\/InheritedMappingsPanel['"]/,
        );
        expect(source).toMatch(
            /tab === 'mappings'[\s\S]{0,200}<InheritedMappingsPanel[\s\S]{0,200}\/policies\/\$\{policyId\}\/mappings/,
        );
        expect(source).toMatch(/entityLabel="policy"/);
    });

    it('lazy-loads PolicyTraceabilityPanel and renders it against the traceability endpoint', () => {
        expect(source).toMatch(
            /dynamic\(\s*\(\)\s*=>\s*import\(['"]@\/components\/PolicyTraceabilityPanel['"]\)[\s\S]{0,120}ssr:\s*false/,
        );
        expect(source).toMatch(
            /tab === 'traceability'[\s\S]{0,200}<PolicyTraceabilityPanel[\s\S]{0,200}\/policies\/\$\{policyId\}\/traceability/,
        );
    });
});
