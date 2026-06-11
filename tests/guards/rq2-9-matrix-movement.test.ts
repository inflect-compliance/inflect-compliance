/**
 * RQ2-9 — matrix-movement ratchet.
 *
 * Regression classes guarded:
 *
 *   - the risks list dropping the decomposed residual dims from its
 *     select (the movement view silently starves);
 *   - legacy undecomposed residuals creeping into the movement set
 *     (a score without dims has no destination cell — inventing one
 *     draws a lie);
 *   - the overlay losing its zero-cost gate or its dedupe.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const repo = read('src/app-layer/repositories/RiskRepository.ts');
const client = read('src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx');
const matrix = read('src/components/ui/RiskMatrix.tsx');

describe('RQ2-9 — inherent → residual movement', () => {
    test('the list select ships the decomposed residual dims', () => {
        for (const f of ['residualLikelihood: true', 'residualImpact: true']) {
            expect(repo).toContain(f);
        }
    });

    test('only decomposed residuals qualify as movements (legacy rows excluded)', () => {
        const start = client.indexOf('const matrixMovements');
        const block = client.slice(start, start + 1200);
        expect(block).toMatch(/residualLikelihood != null/);
        expect(block).toMatch(/residualImpact != null/);
        // The rollup score alone must never qualify a row.
        expect(block).not.toMatch(/residualScore\s*!=/);
    });

    test('the matrix wires movements and keeps the zero-cost gate', () => {
        expect(client).toMatch(/movements=\{matrixMovements\}/);
        expect(matrix).toMatch(/hasMovements && \(/);
        expect(matrix).toMatch(/movementActive && \(/);
    });

    test('identical paths dedupe into counted arrows; same-cell pairs skipped', () => {
        expect(matrix).toMatch(/byPath/);
        expect(matrix).toMatch(/m\.from\.likelihood === m\.to\.likelihood && m\.from\.impact === m\.to\.impact\) continue;/);
    });

    test('the overlay never intercepts cell clicks', () => {
        const overlay = matrix.slice(
            matrix.indexOf('risk-matrix-movement-overlay'),
            matrix.indexOf('</svg>', matrix.indexOf('risk-matrix-movement-overlay')),
        );
        expect(matrix.slice(matrix.indexOf('movementActive && ('), matrix.indexOf('movementArrows.map'))).toMatch(/pointer-events-none/);
        expect(overlay.length).toBeGreaterThan(0);
    });
});
