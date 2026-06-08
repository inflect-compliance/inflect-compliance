/**
 * VR-6 — live execution overlay reducer.
 */
import { buildOverlayMap, overlayClassFor } from '@/lib/processes/canvas-execution-overlay';

describe('buildOverlayMap', () => {
    it('returns an empty map for undefined', () => {
        expect(buildOverlayMap(undefined).size).toBe(0);
    });

    it('maps recent terminal executions by ruleId', () => {
        const m = buildOverlayMap({
            running: [],
            recent: [
                { ruleId: 'r1', status: 'SUCCEEDED', createdAt: '2026-06-08T00:00:00Z' },
                { ruleId: 'r2', status: 'FAILED', createdAt: '2026-06-08T00:01:00Z' },
            ],
        });
        expect(m.get('r1')?.status).toBe('SUCCEEDED');
        expect(m.get('r2')?.status).toBe('FAILED');
    });

    it('RUNNING wins over a terminal state for the same rule + counts concurrency', () => {
        const m = buildOverlayMap({
            running: [
                { ruleId: 'r1', status: 'RUNNING', createdAt: '2026-06-08T00:02:00Z' },
                { ruleId: 'r1', status: 'RUNNING', createdAt: '2026-06-08T00:02:05Z' },
            ],
            recent: [{ ruleId: 'r1', status: 'SUCCEEDED', createdAt: '2026-06-08T00:00:00Z' }],
        });
        expect(m.get('r1')?.status).toBe('RUNNING');
        expect(m.get('r1')?.count).toBe(2);
    });
});

describe('overlayClassFor', () => {
    it('maps each status to a distinct chassis treatment', () => {
        expect(overlayClassFor('RUNNING')).toContain('animate-pulse');
        expect(overlayClassFor('SUCCEEDED')).toContain('ring-content-success');
        expect(overlayClassFor('FAILED')).toContain('ring-content-error');
        expect(overlayClassFor('SKIPPED')).toContain('opacity-50');
        expect(overlayClassFor(undefined)).toBe('');
    });
});
