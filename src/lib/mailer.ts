/**
 * Email provider abstraction.
 *
 * Providers:
 * - ConsoleEmailProvider: logs to console (dev default)
 * - NodemailerProvider:   sends via SMTP (production)
 * - StubEmailProvider:    records messages for tests
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '@/lib/observability/logger';

export interface EmailMessage {
    to: string;
    subject: string;
    text: string;
    html?: string;
    from?: string;   // Override default sender
    bcc?: string;    // Compliance mailbox BCC
}

export interface EmailProvider {
    send(msg: EmailMessage): Promise<void>;
}

// ─── Console (dev) ───

export class ConsoleEmailProvider implements EmailProvider {
    async send(msg: EmailMessage): Promise<void> {
        logger.debug('Email sent (dev console sink)', {
            component: 'mailer',
            to: msg.to,
            subject: msg.subject,
            bodyPreview: msg.text.substring(0, 200),
            ...(msg.from && { from: msg.from }),
            ...(msg.bcc && { bcc: msg.bcc }),
        });
    }
}

// ─── Nodemailer (production SMTP) ───

export class NodemailerProvider implements EmailProvider {
    private transporter: Transporter;

    constructor(config: { host: string; port: number; user?: string; pass?: string; from: string }) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            ...(config.user && config.pass
                ? { auth: { user: config.user, pass: config.pass } }
                : {}),
        });
        this.from = config.from;
    }

    private from: string;

    async send(msg: EmailMessage): Promise<void> {
        await this.transporter.sendMail({
            from: msg.from || this.from,
            to: msg.to,
            subject: msg.subject,
            text: msg.text,
            ...(msg.html ? { html: msg.html } : {}),
            ...(msg.bcc ? { bcc: msg.bcc } : {}),
        });
    }
}

// ─── Stub (tests) ───

export class StubEmailProvider implements EmailProvider {
    public sentMessages: EmailMessage[] = [];

    async send(msg: EmailMessage): Promise<void> {
        this.sentMessages.push(msg);
    }

    reset(): void {
        this.sentMessages = [];
    }
}

// ─── Singleton ───

let provider: EmailProvider = new ConsoleEmailProvider();
let envInitAttempted = false;

export function setEmailProvider(p: EmailProvider) {
    provider = p;
}

export function getEmailProvider(): EmailProvider {
    return provider;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
    // Lazy, per-module-instance init from env. Next's bundler can load
    // mailer.ts in a DIFFERENT chunk for a route handler than the one
    // `instrumentation.ts` initialized at startup, leaving the route's
    // copy on the default console sink — so emails (invites, etc.)
    // silently no-op even though SMTP is configured. Initialize on the
    // first real send so whichever instance actually sends picks up
    // SMTP from env. Guarded on the provider still being the console
    // default, so a caller that explicitly set a provider (tests' stub,
    // or a manual setEmailProvider) is never overridden.
    if (!envInitAttempted && provider instanceof ConsoleEmailProvider) {
        envInitAttempted = true;
        initMailerFromEnv();
    }
    await provider.send(msg);
}

/**
 * Initialize the provider from environment variables.
 * Call once at app startup (e.g., in instrumentation.ts or server init).
 *
 * Uses the validated env module (not raw env vars).
 */
export function initMailerFromEnv(): void {
    // Dynamic import to avoid circular deps at module parse time

    const { env } = require('@/env');
    const host = env.SMTP_HOST;
    if (host) {
        const port = env.SMTP_PORT ?? 587;
        const user = env.SMTP_USER;
        const pass = env.SMTP_PASS;
        const from = env.SMTP_FROM ?? 'noreply@inflect.app';
        setEmailProvider(new NodemailerProvider({ host, port, user, pass, from }));
    }
    // Otherwise keep ConsoleEmailProvider (dev/test default)
}
