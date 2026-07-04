'use client';

/**
 * Language switcher — segmented control for the UI locale.
 *
 * Mounted inside `<UserMenu>` beside the theme toggle. Selecting a locale
 * persists it to the `inflect_locale` cookie via the `setLocaleAction` server
 * action, then calls `router.refresh()` so every server component re-renders
 * with the new next-intl catalog (the cookie is read server-side in
 * `src/i18n.ts`).
 *
 * Options are labelled with endonyms ("English" / "Български") — each language
 * in its own tongue — so the control is legible whichever locale is active.
 */

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { ToggleGroup } from '@/components/ui/toggle-group';
import {
    SUPPORTED_LOCALES,
    LOCALE_LABELS,
    resolveLocale,
} from '@/lib/locale-constants';
import { setLocaleAction } from '@/lib/set-locale-action';

export interface LocaleSwitcherProps {
    className?: string;
}

const OPTIONS = SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: LOCALE_LABELS[locale],
}));

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
    // Active locale from the NextIntlClientProvider (driven by the cookie).
    const current = resolveLocale(useLocale());
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const onSelect = (next: string) => {
        if (next === current || pending) return;
        startTransition(async () => {
            await setLocaleAction(next);
            // Server components (incl. the whole app tree) re-read the cookie.
            router.refresh();
        });
    };

    return (
        <ToggleGroup
            size="sm"
            options={OPTIONS}
            selected={current}
            selectAction={onSelect}
            ariaLabel="Language"
            className={className}
        />
    );
}
