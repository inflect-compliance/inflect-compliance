import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers';
import { CSP_NONCE_HEADER } from '@/lib/security/csp';
import './globals.css';

export const metadata: Metadata = {
    title: 'Inflect Compliance — Платформа за съответствие по ISO 27001',
    description: 'Цялостно управление на съответствието по ISO 27001:2022 с карти на SOC 2 и NIS2.',
};

/**
 * R11-PR9 — explicit viewport metadata. Next.js no longer emits a
 * default viewport meta starting in 14.x, so any layout that wants
 * sane mobile rendering must declare it. Locked here at the root so
 * every page inherits the same width=device-width + initial-scale=1
 * baseline. `maximumScale: 5` keeps user-pinch-zoom intact (an
 * accessibility requirement — never set 1 unless the design has
 * truly tested at every viewport).
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();
    const messages = await getMessages();
    const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;

    return (
        // `data-theme="dark"` seeds the SSR markup so the first paint matches
        // the baseline palette. ThemeProvider rehydrates from localStorage /
        // prefers-color-scheme on the client and flips the attribute if needed.
        <html lang={locale} data-theme="dark" suppressHydrationWarning>
            <body suppressHydrationWarning nonce={nonce}>
                <Providers>
                    <NextIntlClientProvider messages={messages} locale={locale}>
                        {children}
                    </NextIntlClientProvider>
                </Providers>
            </body>
        </html>
    );
}
