/**
 * Structural guard — the mailer MUST be initialized from env at startup.
 *
 * `initMailerFromEnv()` swaps the mailer from the dev console sink to the
 * real SMTP transport when `SMTP_HOST` is configured. For a long time it
 * existed but was never called in production startup, so EVERY email
 * (verification, password reset, notification outbox, invites) silently
 * went to the console sink and never reached a recipient — even with SMTP
 * configured.
 *
 * Both server entrypoints must call it: the web tier
 * (`src/instrumentation.ts`) and the BullMQ worker (`scripts/worker.ts`,
 * which runs the notification outbox + digests). This guard fails if
 * either drops the call.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('mailer initialization wiring', () => {
    it('web instrumentation calls initMailerFromEnv()', () => {
        const src = read('src/instrumentation.ts');
        expect(src).toContain('initMailerFromEnv');
        expect(src).toMatch(/initMailerFromEnv\s*\(\s*\)/);
    });

    it('the BullMQ worker calls initMailerFromEnv()', () => {
        const src = read('scripts/worker.ts');
        expect(src).toContain('initMailerFromEnv');
        expect(src).toMatch(/initMailerFromEnv\s*\(\s*\)/);
    });
});
