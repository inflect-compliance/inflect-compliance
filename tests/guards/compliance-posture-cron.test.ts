/**
 * Structural guard — compliance-posture summary cron wiring.
 *
 * Locks the daily-cache design in place: the per-tenant executor is
 * registered and references `payload.tenantId`, the cross-tenant dispatch is
 * registered + scheduled daily, and the payload contract carries a tenantId.
 * Complements the DB-agnostic checks in
 * tests/unit/job-tenant-isolation-regression.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const registry = read('src/app-layer/jobs/executor-registry.ts');
const schedules = read('src/app-layer/jobs/schedules.ts');
const types = read('src/app-layer/jobs/types.ts');

describe('compliance-posture cron wiring', () => {
    it('registers both the per-tenant and dispatch executors', () => {
        expect(registry).toMatch(/executorRegistry\.register\('compliance-posture-summary'/);
        expect(registry).toMatch(/executorRegistry\.register\('compliance-posture-summary-dispatch'/);
    });

    it('per-tenant executor references payload.tenantId', () => {
        // Slice the per-tenant registration body (up to the dispatch one).
        const start = registry.indexOf("register('compliance-posture-summary'");
        const end = registry.indexOf("register('compliance-posture-summary-dispatch'");
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        expect(registry.slice(start, end)).toContain('payload.tenantId');
    });

    it('schedules the dispatch job daily', () => {
        expect(schedules).toContain("name: 'compliance-posture-summary-dispatch'");
    });

    it('payload contract carries tenantId on the per-tenant job', () => {
        expect(types).toMatch(/CompliancePostureSummaryPayload\s*\{[^}]*tenantId:\s*string/);
        expect(types).toMatch(/'compliance-posture-summary':\s*CompliancePostureSummaryPayload/);
    });
});
