'use client';

/**
 * Epic 51 — theme provider & `useTheme()` hook.
 *
 * Thin client-side layer that flips `html[data-theme]` between `"dark"` (the
 * default) and `"light"`, persisting the user's choice in localStorage and
 * honouring the system `prefers-color-scheme` for the first visit.
 *
 * The actual colour values live in `src/styles/tokens.css`. This file only
 * decides *which palette* is active; every token-driven component gets the
 * switch for free.
 *
 * The provider must mount inside the root layout (client-side); it does not
 * render anything and has no performance cost on SSR. Reading `useTheme()`
 * before the provider mounts returns `"dark"` (the baseline) — consistent
 * with SSR snapshots.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeContextValue {
    theme: Theme;
    setTheme: (next: Theme) => void;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * localStorage key for the persisted theme. Exported so the anti-FOUC inline
 * script in the root layout (`src/app/layout.tsx`) reads the SAME key — the
 * script sets `data-theme` BEFORE first paint so there's no dark→light flash
 * on load / hard navigation, then this provider's effect reconciles state.
 */
export const STORAGE_KEY = 'inflect:theme';
const ATTR = 'data-theme';

function readInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'dark';
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // localStorage may throw in private / sandboxed contexts — ignore.
    }
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
}

function applyTheme(theme: Theme) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute(ATTR, theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    // Start in dark (the SSR default) and rehydrate on mount to avoid a
    // hydration mismatch when the stored theme differs from the SSR snapshot.
    const [theme, setThemeState] = useState<Theme>('dark');
    const hasHydrated = useRef(false);

    useEffect(() => {
        if (hasHydrated.current) return;
        hasHydrated.current = true;
        const next = readInitialTheme();
        setThemeState(next);
        applyTheme(next);
    }, []);

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next);
        applyTheme(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // ignore — non-persisting is acceptable
        }
    }, []);

    const toggle = useCallback(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }, [theme, setTheme]);

    const value = useMemo(
        () => ({ theme, setTheme, toggle }),
        [theme, setTheme, toggle],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access the current theme and controls. Safe to call outside a provider —
 * returns a no-op `setTheme` / `toggle` plus the SSR-safe default, so feature
 * flags can render a toggle without forcing the provider everywhere.
 */
export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (ctx) return ctx;
    return {
        theme: 'dark',
        setTheme: () => {},
        toggle: () => {},
    };
}
