/**
 * PR-D — webhook SSRF guard.
 */
import { isPrivateAddress, checkWebhookUrl } from '@/app-layer/automation/webhook-safety';

describe('isPrivateAddress', () => {
    it.each(['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '169.254.169.254', '::1', '0.0.0.0'])(
        'flags %s as private',
        (ip) => expect(isPrivateAddress(ip)).toBe(true),
    );
    it.each(['8.8.8.8', '93.184.216.34', '1.1.1.1'])('allows public %s', (ip) =>
        expect(isPrivateAddress(ip)).toBe(false),
    );
});

describe('checkWebhookUrl', () => {
    it('rejects non-https', () => {
        expect(checkWebhookUrl('http://example.com').ok).toBe(false);
    });
    it('rejects localhost + private literals + metadata', () => {
        expect(checkWebhookUrl('https://localhost/h').ok).toBe(false);
        expect(checkWebhookUrl('https://169.254.169.254/').ok).toBe(false);
        expect(checkWebhookUrl('https://10.0.0.1/h').ok).toBe(false);
        expect(checkWebhookUrl('https://foo.internal/h').ok).toBe(false);
    });
    it('accepts a well-formed public https URL', () => {
        const v = checkWebhookUrl('https://hooks.example.com/path');
        expect(v.ok).toBe(true);
        expect(v.host).toBe('hooks.example.com');
    });
    it('rejects a malformed URL', () => {
        expect(checkWebhookUrl('not a url').ok).toBe(false);
    });
});
