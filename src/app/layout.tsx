import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers';
import { CSP_NONCE_HEADER } from '@/lib/security/csp';
import { STORAGE_KEY as THEME_STORAGE_KEY } from '@/components/theme/ThemeProvider';
import './globals.css';

/**
 * Anti-FOUC theme script. Runs synchronously in <head> BEFORE first paint:
 * reads the persisted theme (same key + resolution as ThemeProvider) and sets
 * `data-theme` on <html>. Without it, SSR ships `data-theme="dark"` and the
 * client only flips to light in a post-paint effect — so a light-theme user
 * sees a dark flash on every load / hard navigation. Setting the attribute
 * here, before the browser paints, removes the flash entirely.
 */
const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

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
        // `data-theme="dark"` seeds the SSR markup; the THEME_INIT_SCRIPT below
        // corrects it to the persisted theme BEFORE first paint (no dark→light
        // flash), and ThemeProvider then reconciles its state on the client.
        <html lang={locale} data-theme="dark" suppressHydrationWarning>
            <head>
                {/* Anti-FOUC: set the persisted theme before the browser paints,
                    so a light-theme user never sees a dark flash on load / hard
                    navigation. Carries the CSP nonce when present. */}
                <script
                    nonce={nonce}
                    suppressHydrationWarning
                    dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
                />
                {/*
                    2026-05-14 — CSP `strict-dynamic` + webpack chunk
                    loader bridge. Next.js auto-applies the request
                    nonce to its server-rendered `<script>` and
                    `<link>` tags, but DYNAMICALLY-loaded webpack
                    chunks (Next's `chunks/*.js` for code-split
                    components like the R16 visx/motion charts) are
                    injected at runtime via `document.createElement
                    ('script')`. Those don't inherit the nonce
                    automatically — they need webpack to set
                    `script.nonce` at injection time, which webpack
                    does only when `__webpack_nonce__` is defined.
                    Setting it on `window` (and `globalThis` for
                    completeness in stricter runtimes) BEFORE any
                    chunk loads kicks in is what unblocks
                    strict-dynamic for the chart code.

                    The script itself carries the nonce so CSP
                    allows it. Inline content is deterministic
                    (just `var __webpack_nonce__ = '<nonce>';`),
                    no user input — no XSS surface beyond the
                    nonce itself (which is per-request +
                    cryptographically random).
                */}
                {nonce && (
                    /*
                        2026-05-27 — `suppressHydrationWarning` is
                        LOAD-BEARING. Browsers strip the `nonce`
                        attribute from DOM elements AFTER CSP
                        processing (HTML spec — `nonce` is a one-
                        time secret that must never be readable
                        from JavaScript). React's hydration then
                        compares the SSR-emitted `nonce="…"` to the
                        client-visible `nonce=""` and emits a noisy
                        console error: "tree hydrated but some
                        attributes didn't match. This won't be
                        patched up."
                        Hydration itself succeeds (the bridge sets
                        `__webpack_nonce__` before any chunk
                        loads), but headless QA tools that abort on
                        the first console error misinterpret this
                        as a hard hydration failure — see the
                        2026-05-25 QA pass that marked Sidebar /
                        Forms / Mobile sections as BLOCKED due to
                        "JS hydration failure".
                        `suppressHydrationWarning` is the canonical
                        React fix (https://react.dev/link/
                        hydration-mismatch). It tells React: "this
                        attribute will legitimately differ between
                        server and client — don't warn." Zero CSP
                        change; nonce stays applied for browser
                        enforcement.
                    */
                    <script
                        nonce={nonce}
                        suppressHydrationWarning
                        dangerouslySetInnerHTML={{
                            __html: `window.__webpack_nonce__=${JSON.stringify(nonce)};globalThis.__webpack_nonce__=${JSON.stringify(nonce)};`,
                        }}
                    />
                )}
            </head>
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
