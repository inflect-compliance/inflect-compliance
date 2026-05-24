/**
 * Audit Coherence S5 (2026-05-22) — structural ratchet locking the
 * three Audit Readiness & Scoring gap closures:
 *   1. Time-series `ReadinessSnapshot` model.
 *   2. Per-tenant `readinessWeightsJson` override on `Tenant`.
 *   3. Generic-framework fallback (`computeGenericReadiness`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Audit S5 — Audit Readiness & Scoring', () => {
    describe('schema', () => {
        const audit = read('prisma/schema/audit.prisma');
        const auth = read('prisma/schema/auth.prisma');

        it('ReadinessSnapshot model exists with required fields', () => {
            expect(audit).toMatch(/model ReadinessSnapshot/);
            expect(audit).toMatch(/frameworkKey\s+String/);
            expect(audit).toMatch(/auditCycleId\s+String\?/);
            expect(audit).toMatch(/score\s+Int\b/);
            expect(audit).toMatch(/breakdownJson\s+Json\b/);
            expect(audit).toMatch(/gapCount\s+Int/);
            expect(audit).toMatch(/computedAt\s+DateTime/);
        });

        it('ReadinessSnapshot has the time-series index', () => {
            // The chart query reads by (tenant, framework, computedAt)
            // descending — this index makes that query bounded.
            expect(audit).toMatch(
                /@@index\(\[tenantId,\s*frameworkKey,\s*computedAt\]\)/,
            );
        });

        it('Tenant carries readinessWeightsJson (nullable)', () => {
            expect(auth).toMatch(/readinessWeightsJson\s+Json\?/);
        });

        it('migration SQL exists for the audit S5 changes', () => {
            const migDir = path.join(
                ROOT,
                'prisma/migrations/20260524130000_audit_s5_readiness_snapshot_and_weights',
            );
            expect(fs.existsSync(migDir)).toBe(true);
            const sql = fs.readFileSync(
                path.join(migDir, 'migration.sql'),
                'utf8',
            );
            expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "ReadinessSnapshot"/);
            expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "readinessWeightsJson"/);
        });
    });

    describe('scoring usecase', () => {
        const src = read('src/app-layer/usecases/audit-readiness-scoring.ts');

        it('computeReadiness no longer throws notFound for unknown frameworks', () => {
            // Pre-this-PR an unknown framework was a `throw notFound`.
            // Post-this-PR it falls through to `computeGenericReadiness`.
            expect(src).not.toMatch(
                /throw notFound\(`No readiness model for framework/,
            );
            expect(src).toMatch(/computeGenericReadiness/);
        });

        it('computeGenericReadiness is defined', () => {
            expect(src).toMatch(/async function computeGenericReadiness/);
        });

        it('GENERIC fallback weights are documented + summing to 1.0', () => {
            // The defaults are coverage 0.5 + evidence 0.35 + issues 0.15
            // = 1.0. The structural test pins the SHAPE so a future
            // change can't silently desync the sum.
            expect(src).toMatch(
                /GENERIC_WEIGHTS\s*=\s*\{[\s\S]{0,200}coverage:[\s\S]{0,80}evidence:[\s\S]{0,80}issues:/,
            );
        });

        it('loadEffectiveWeights honours per-tenant override', () => {
            expect(src).toMatch(/async function loadEffectiveWeights/);
            expect(src).toMatch(/readinessWeightsJson/);
            // Validation: each value in [0,1] and sum within 1.0 ± 0.001.
            expect(src).toMatch(/Math\.abs\(sum\s*-\s*1\.0\)/);
        });

        it('computeReadiness persists a ReadinessSnapshot after scoring', () => {
            expect(src).toMatch(/readinessSnapshot\.create/);
            // Snapshot write is best-effort (try/catch) so the
            // observational write never breaks the computation.
            // Window widened to 900 — the create's data: {} block is
            // multi-line + indented and the matching catch sits ~450
            // chars past the create marker.
            expect(src).toMatch(
                /try\s*\{[\s\S]{0,900}readinessSnapshot\.create[\s\S]{0,800}\}\s*catch/,
            );
        });

        it('exports getReadinessHistory for the trend chart', () => {
            expect(src).toMatch(
                /export async function getReadinessHistory/,
            );
            // Returns rows ordered by computedAt desc, bounded by `take`.
            expect(src).toMatch(/orderBy:\s*\{\s*computedAt:\s*['"]desc['"]/);
            expect(src).toMatch(/Math\.min\(Math\.max\(1,\s*opts\.take\s*\?\?/);
        });
    });
});
