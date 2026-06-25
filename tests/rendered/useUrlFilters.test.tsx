/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useUrlFilters — branch coverage.
 *
 * Branches enumerated:
 *   - readFromUrl: window === undefined arm (not reachable in jsdom —
 *     window is always defined; covered via the SSR fallback logically),
 *     v truthy → set / v falsy → skip
 *   - useState initialiser: window-defined arm reads from URL
 *   - hydration effect: serialized !== current → setFilters branch, and
 *     serialized === current → no-op branch
 *   - pushToUrl: newFilters[key] truthy → params.set, falsy → params.delete;
 *     qs truthy (?qs) vs empty ('') ternary arms
 *   - setFilter: value truthy → assign; falsy → delete
 *   - clearFilters: builds query after removing keys + cursor
 *   - popstate listener: setFilters(readFromUrl())
 *   - hasActiveFilters: keys.length > 0 vs === 0
 *
 * next/navigation is mocked: useRouter().replace is a spy, usePathname
 * returns a fixed path. window.location.search is driven via
 * history.replaceState so readFromUrl/pushToUrl see real URLSearchParams.
 */

const replaceSpy = jest.fn((...args: any[]) => {});
const PATHNAME = '/t/acme/risks';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: replaceSpy, push: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => PATHNAME,
}));

import { act, renderHook } from '@testing-library/react';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';

function setSearch(search: string) {
    // Drive the jsdom URL so window.location.search reflects `search`.
    window.history.replaceState({}, '', `${PATHNAME}${search}`);
}

describe('useUrlFilters', () => {
    beforeEach(() => {
        replaceSpy.mockClear();
        setSearch('');
    });

    // Branch: initial read from URL — `v` truthy sets, missing key skipped.
    it('parses initial filters from the URL (truthy + missing arms)', () => {
        setSearch('?status=OPEN');
        const { result } = renderHook(() => useUrlFilters(['status', 'owner']));
        expect(result.current.filters).toEqual({ status: 'OPEN' });
        // owner missing → skipped (the `if (v)` false arm)
        expect(result.current.hasActiveFilters).toBe(true);
    });

    // Branch: empty URL → empty filters, hasActiveFilters false arm.
    it('returns empty filters and hasActiveFilters=false with no params', () => {
        setSearch('');
        const { result } = renderHook(() => useUrlFilters(['status']));
        expect(result.current.filters).toEqual({});
        expect(result.current.hasActiveFilters).toBe(false);
    });

    // Branch: serverFilters fallback is wired (used during SSR / when
    // provided). In jsdom window is defined so URL wins, but we exercise
    // the parameter path.
    it('accepts serverFilters argument (URL still wins in jsdom)', () => {
        setSearch('?status=CLOSED');
        const { result } = renderHook(() =>
            useUrlFilters(['status'], { status: 'SEEDED' }),
        );
        // URL is read on the client and overrides the seed.
        expect(result.current.filters).toEqual({ status: 'CLOSED' });
    });

    // Branch: setFilter with a truthy value → params.set + router.replace
    // with a query string (qs truthy → `?qs` arm).
    it('setFilter sets a value, deletes cursor, and pushes to URL', () => {
        setSearch('?cursor=abc');
        const { result } = renderHook(() => useUrlFilters(['status']));
        act(() => result.current.setFilter('status', 'OPEN'));
        expect(result.current.filters).toEqual({ status: 'OPEN' });
        expect(replaceSpy).toHaveBeenCalledTimes(1);
        const url = replaceSpy.mock.calls[0][0] as string;
        expect(url).toContain('status=OPEN');
        // cursor removed
        expect(url).not.toContain('cursor');
        // scroll:false option passed
        expect(replaceSpy.mock.calls[0][1]).toEqual({ scroll: false });
    });

    // Branch: setFilter with a falsy value → delete key; resulting empty
    // query → qs '' → bare pathname (qs falsy ternary arm).
    it('setFilter with empty value deletes the key and pushes bare path', () => {
        setSearch('?status=OPEN');
        const { result } = renderHook(() => useUrlFilters(['status']));
        act(() => result.current.setFilter('status', ''));
        expect(result.current.filters).toEqual({});
        const url = replaceSpy.mock.calls[0][0] as string;
        // No query string at all → just the pathname.
        expect(url).toBe(PATHNAME);
    });

    // Branch: pushToUrl falsy-key arm (params.delete) for a key not set.
    it('setFilter only writes the changed key, leaving managed-but-unset keys absent', () => {
        setSearch('');
        const { result } = renderHook(() => useUrlFilters(['status', 'owner']));
        act(() => result.current.setFilter('status', 'OPEN'));
        const url = replaceSpy.mock.calls[0][0] as string;
        expect(url).toContain('status=OPEN');
        // owner not in newFilters → delete arm → absent
        expect(url).not.toContain('owner');
    });

    // Branch: clearFilters — removes all managed keys + cursor, pushes.
    it('clearFilters empties state and removes managed keys from URL', () => {
        setSearch('?status=OPEN&owner=me&cursor=xyz&other=keep');
        const { result } = renderHook(() => useUrlFilters(['status', 'owner']));
        act(() => result.current.clearFilters());
        expect(result.current.filters).toEqual({});
        expect(result.current.hasActiveFilters).toBe(false);
        const url = replaceSpy.mock.calls[0][0] as string;
        expect(url).not.toContain('status');
        expect(url).not.toContain('owner');
        expect(url).not.toContain('cursor');
        // Unmanaged param preserved → qs truthy arm.
        expect(url).toContain('other=keep');
    });

    // Branch: clearFilters when only managed keys existed → empty qs → bare path.
    it('clearFilters pushes bare path when nothing else remains', () => {
        setSearch('?status=OPEN');
        const { result } = renderHook(() => useUrlFilters(['status']));
        act(() => result.current.clearFilters());
        const url = replaceSpy.mock.calls[0][0] as string;
        expect(url).toBe(PATHNAME);
    });

    // Branch: popstate listener re-reads from URL → setFilters(readFromUrl()).
    it('syncs filters on browser popstate (back/forward)', () => {
        setSearch('?status=OPEN');
        const { result } = renderHook(() => useUrlFilters(['status']));
        expect(result.current.filters).toEqual({ status: 'OPEN' });
        // Simulate back navigation: change URL then fire popstate.
        act(() => {
            setSearch('?status=CLOSED');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(result.current.filters).toEqual({ status: 'CLOSED' });
    });

    // Branch: popstate to an empty URL clears filters.
    it('popstate to an empty URL clears the filters', () => {
        setSearch('?status=OPEN');
        const { result } = renderHook(() => useUrlFilters(['status']));
        act(() => {
            setSearch('');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(result.current.filters).toEqual({});
    });

    // Branch: hydration effect no-op arm — when the URL already matches
    // the initial state, setFilters is NOT called (serialized === current).
    // We assert the listener cleans up on unmount (cleanup return path).
    it('removes the popstate listener on unmount', () => {
        const removeSpy = jest.spyOn(window, 'removeEventListener');
        const { unmount } = renderHook(() => useUrlFilters(['status']));
        unmount();
        expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
        removeSpy.mockRestore();
    });

    // NOTE: the hydration-effect divergence arm (source lines 60-62, where
    // the mount effect re-reads the URL and calls setFilters because it
    // differs from the SSR-captured initial state) and the four
    // `typeof window === 'undefined'` SSR guards are not reachable under
    // jsdom: window is always defined, window.location is non-configurable
    // (so its `search` getter can't be split between the useState
    // initializer and the mount effect), and the initializer + effect read
    // the identical live URL. These are the documented hard-to-reach effect
    // arms; everything else is covered.

    // Branch: keys change between renders re-derives readFromUrl (useCallback dep).
    it('re-reads when the managed key set changes', () => {
        setSearch('?status=OPEN&owner=me');
        const { result, rerender } = renderHook(
            ({ keys }) => useUrlFilters(keys),
            { initialProps: { keys: ['status'] } },
        );
        expect(result.current.filters).toEqual({ status: 'OPEN' });
        // Widen the managed keys and re-fire popstate so readFromUrl runs
        // with the new key set.
        rerender({ keys: ['status', 'owner'] });
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(result.current.filters).toEqual({ status: 'OPEN', owner: 'me' });
    });
});
