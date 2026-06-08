/**
 * Automation Epic 9 — structural ratchet for the analytics dashboard.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('Automation Epic 9 — analytics dashboard', () => {
    it('analytics usecase + route + tab exist', () => {
        expect(exists('src/app-layer/usecases/automation-analytics.ts')).toBe(true);
        expect(exists('src/app/api/t/[tenantSlug]/automation/analytics/route.ts')).toBe(true);
        expect(exists('src/app/t/[tenantSlug]/(app)/processes/AnalyticsTab.tsx')).toBe(true);
    });

    it('the usecase aggregates the documented metrics', () => {
        const src = read('src/app-layer/usecases/automation-analytics.ts');
        for (const k of ['topRules', 'slaBreaches', 'avgDurationMs', 'errorRate', 'executions']) {
            expect(src).toMatch(new RegExp(k));
        }
    });

    it('ProcessesClient mounts the Analytics tab', () => {
        const src = read('src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx');
        expect(src).toMatch(/AnalyticsTab/);
        expect(src).toMatch(/"analytics"/);
    });
});
