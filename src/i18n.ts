import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { LOCALE_COOKIE, resolveLocale } from '@/lib/locale-constants';

/**
 * next-intl request config (no i18n routing — locale lives in a cookie, not the
 * URL). Runs once per request on the server; `getLocale()` / `getMessages()` in
 * the root layout delegate here, so resolving the locale from the
 * `inflect_locale` cookie is enough to render the whole app — and every string
 * already wired to the catalog — in the chosen language on the first SSR byte.
 *
 * Unknown / absent cookie → `DEFAULT_LOCALE` ('en') via `resolveLocale`, so a
 * tampered cookie can never point the dynamic `import()` at a missing file.
 */
export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default,
    };
});
