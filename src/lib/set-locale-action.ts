'use server';

import { cookies } from 'next/headers';

import {
    LOCALE_COOKIE,
    resolveLocale,
    type Locale,
} from '@/lib/locale-constants';

/**
 * Server action: persist the UI locale in the `inflect_locale` cookie.
 *
 * The value is coerced through `resolveLocale`, so an unsupported input silently
 * falls back to the default rather than writing a cookie that would point the
 * request-config `import()` at a missing catalog. 1-year `max-age`,
 * `sameSite=lax`, `path=/` — mirrors the theme cookie. The caller
 * (`<LocaleSwitcher>`) triggers `router.refresh()` afterwards so the server
 * components re-render with the new catalog.
 */
export async function setLocaleAction(next: string): Promise<Locale> {
    const locale = resolveLocale(next);
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
    });
    return locale;
}
