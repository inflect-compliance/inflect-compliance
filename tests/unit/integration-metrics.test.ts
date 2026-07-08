/**
 * H6 — integration metrics recorders are safe to call (no-op OTel meter in test)
 * and idempotent where they register global instruments.
 */
import {
    recordCheckOutcome,
    recordSyncTruncated,
    recordIdentityDeprovisioned,
    recordDeviceReport,
    recordAiGeneration,
    startIntegrationFreshnessReporting,
    _resetIntegrationFreshnessForTesting,
} from '@/lib/observability/integration-metrics';

describe('H6 — integration metrics', () => {
    beforeEach(() => _resetIntegrationFreshnessForTesting());

    it('all recorders are callable without throwing', () => {
        expect(() => {
            recordCheckOutcome({ provider: 'okta', checkType: 'mfa_enforced', status: 'PASSED', durationMs: 12 });
            recordCheckOutcome({ provider: 'aws-posture', checkType: 'soc2', status: 'NOT_APPLICABLE' });
            recordSyncTruncated({ provider: 'okta' });
            recordIdentityDeprovisioned({ provider: 'okta', count: 3 });
            recordIdentityDeprovisioned({ provider: 'okta', count: 0 }); // no-op on zero
            recordDeviceReport();
            recordAiGeneration({ feature: 'questionnaire', tokens: 512 });
            recordAiGeneration({ feature: 'assistant' });
        }).not.toThrow();
    });

    it('the freshness gauge registers idempotently', () => {
        expect(() => {
            startIntegrationFreshnessReporting();
            startIntegrationFreshnessReporting(); // second call is a no-op
        }).not.toThrow();
    });

    it('NOT_APPLICABLE is accepted as a first-class check status', () => {
        expect(() => recordCheckOutcome({ provider: 'device', checkType: 'devices_encrypted', status: 'NOT_APPLICABLE' })).not.toThrow();
    });
});
