/** @jest-environment jsdom */
/**
 * Coverage for the Stage-1 (FLAG-OFF) canvas-presence hook. The
 * hook is a deliberate no-op: it returns an empty roster and stable
 * no-op publish callbacks. These tests lock that contract and
 * exercise the callback bodies + referential stability.
 */
import { act, renderHook } from '@testing-library/react';
import {
    useCanvasPresence,
    __INTERNAL_PRESENCE,
} from '@/lib/processes/use-canvas-presence';

describe('useCanvasPresence', () => {
    it('returns the canonical no-op state shape', () => {
        const { result } = renderHook(() =>
            useCanvasPresence({ mapId: 'map-1', userId: 'user-1' }),
        );

        expect(result.current.roster).toEqual([]);
        expect(typeof result.current.publishCursor).toBe('function');
        expect(typeof result.current.publishSelection).toBe('function');
    });

    it('publish callbacks are no-ops that do not throw', () => {
        const { result } = renderHook(() =>
            useCanvasPresence({ mapId: 'map-1', userId: 'user-1' }),
        );

        act(() => {
            result.current.publishCursor({ x: 10, y: 20 });
            result.current.publishCursor(null);
            result.current.publishSelection(['node-a', 'node-b']);
            result.current.publishSelection([]);
        });

        // Still a no-op roster after publishing.
        expect(result.current.roster).toEqual([]);
    });

    it('keeps callbacks and roster referentially stable across rerenders', () => {
        const { result, rerender } = renderHook(
            (props: { mapId: string | null; userId: string }) =>
                useCanvasPresence(props),
            { initialProps: { mapId: 'map-1', userId: 'user-1' } },
        );

        const first = result.current;
        rerender({ mapId: 'map-2', userId: 'user-2' });
        const second = result.current;

        expect(second.publishCursor).toBe(first.publishCursor);
        expect(second.publishSelection).toBe(first.publishSelection);
        expect(second.roster).toBe(first.roster);
    });

    it('handles a null mapId without error', () => {
        const { result } = renderHook(() =>
            useCanvasPresence({ mapId: null, userId: 'user-1' }),
        );
        expect(result.current.roster).toEqual([]);
    });

    it('exposes the stable internal test contract', () => {
        expect(__INTERNAL_PRESENCE.flagName).toBe(
            'NEXT_PUBLIC_ENABLE_CANVAS_PRESENCE',
        );
        expect(__INTERNAL_PRESENCE.defaultRoster).toEqual([]);
    });
});
