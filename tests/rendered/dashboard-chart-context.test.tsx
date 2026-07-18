/**
 * R17-PR6 — DashboardChartContext unit tests.
 *
 * The provider holds the currently-focused KPI key (or null). The
 * hook returns `{selectedKpi, setSelectedKpi, toggleSelectedKpi}`.
 * These tests lock in the four behaviours future focus consumers
 * will rely on:
 *
 *   1. Default state is null (dashboard renders the unfocused
 *      baseline — byte-for-byte same as today before any consumer
 *      wires up).
 *   2. setSelectedKpi sets / clears the focus directly.
 *   3. toggleSelectedKpi toggles same-key off, sets a different
 *      key on (the "click the same tile to clear" UX).
 *   4. Calling the hook outside the provider throws — fail-fast,
 *      not silent.
 */
import { act, render, renderHook } from '@testing-library/react';
import {
    DashboardChartProvider,
    useDashboardChartFocus,
} from '@/app/t/[tenantSlug]/(app)/dashboard/DashboardChartContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DashboardChartProvider>{children}</DashboardChartProvider>
);

describe('DashboardChartContext', () => {
    it('default state is null (no tile selected)', () => {
        const { result } = renderHook(() => useDashboardChartFocus(), {
            wrapper,
        });
        expect(result.current.selectedKpi).toBeNull();
    });

    it('setSelectedKpi sets and clears the focus directly', () => {
        const { result } = renderHook(() => useDashboardChartFocus(), {
            wrapper,
        });

        act(() => result.current.setSelectedKpi('risks'));
        expect(result.current.selectedKpi).toBe('risks');

        act(() => result.current.setSelectedKpi('evidence'));
        expect(result.current.selectedKpi).toBe('evidence');

        act(() => result.current.setSelectedKpi(null));
        expect(result.current.selectedKpi).toBeNull();
    });

    it('toggleSelectedKpi toggles same-key off and sets different-key', () => {
        const { result } = renderHook(() => useDashboardChartFocus(), {
            wrapper,
        });

        // Click an unselected tile → sets focus.
        act(() => result.current.toggleSelectedKpi('coverage'));
        expect(result.current.selectedKpi).toBe('coverage');

        // Click the same tile again → clears focus.
        act(() => result.current.toggleSelectedKpi('coverage'));
        expect(result.current.selectedKpi).toBeNull();

        // Click another tile → sets focus to that key.
        act(() => result.current.toggleSelectedKpi('risks'));
        expect(result.current.selectedKpi).toBe('risks');

        // Click yet another tile → swaps focus (does NOT clear).
        act(() => result.current.toggleSelectedKpi('evidence'));
        expect(result.current.selectedKpi).toBe('evidence');
    });

    it('throws if the hook is used outside the provider', () => {
        // The hook's `if (!ctx) throw` is the fail-fast guard.
        // Without it, a misplaced consumer would silently see
        // "no focus ever fires" — much harder to debug.
        const Consumer = () => {
            useDashboardChartFocus();
            return null;
        };

        // Suppress the expected React error boundary log noise.
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(() => render(<Consumer />)).toThrow(
                /useDashboardChartFocus must be used inside <DashboardChartProvider>/,
            );
        } finally {
            spy.mockRestore();
        }
    });

    it('setter identity is stable across renders (effect-dep safe)', () => {
        const { result, rerender } = renderHook(() => useDashboardChartFocus(), {
            wrapper,
        });

        const firstSetter = result.current.setSelectedKpi;
        const firstToggle = result.current.toggleSelectedKpi;

        // Trigger a re-render via a no-op state change.
        act(() => result.current.setSelectedKpi(null));
        rerender();

        expect(result.current.setSelectedKpi).toBe(firstSetter);
        expect(result.current.toggleSelectedKpi).toBe(firstToggle);
    });
});
