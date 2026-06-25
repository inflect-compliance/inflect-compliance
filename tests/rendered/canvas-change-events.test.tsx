/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useCanvasChangeEmitter — branch coverage.
 *
 * Branches enumerated:
 *   - subscribe(): adds to set, returns unsubscribe (delete) closure
 *   - emit(): nodeIds ?? [] and edgeIds ?? [] nullish arms (both
 *     present and both absent)
 *   - emit() dispatch loop: subscriber that throws → catch arm
 *     (sibling subscribers still fire)
 *   - emit() snapshots the set before iterating → a subscriber that
 *     unsubscribes itself mid-dispatch still receives the current event
 *   - emitGraphReplace(): maps node/edge ids from a snapshot
 *   - unmount cleanup effect: clears the registry
 */
import { act, renderHook } from '@testing-library/react';
import { useCanvasChangeEmitter } from '@/lib/processes/canvas-change-events';

describe('useCanvasChangeEmitter', () => {
    // Branch: subscribe adds, emit delivers, both id arrays explicit.
    it('delivers emitted events to a subscriber with provided ids', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        act(() => {
            result.current.subscribe((e) => received.push(e));
        });
        act(() => {
            result.current.emit('node.add', { nodeIds: ['n1'], edgeIds: ['e1'] });
        });
        expect(received).toHaveLength(1);
        expect(received[0].type).toBe('node.add');
        expect(received[0].nodeIds).toEqual(['n1']);
        expect(received[0].edgeIds).toEqual(['e1']);
        expect(typeof received[0].timestamp).toBe('number');
    });

    // Branch: nodeIds ?? [] and edgeIds ?? [] — both absent → default [].
    it('defaults nodeIds/edgeIds to empty arrays when omitted', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        act(() => {
            result.current.subscribe((e) => received.push(e));
        });
        act(() => {
            result.current.emit('graph.replace', {});
        });
        expect(received[0].nodeIds).toEqual([]);
        expect(received[0].edgeIds).toEqual([]);
    });

    // Branch: only one of the two ids provided (mixed nullish arms).
    it('defaults only the missing id list', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        act(() => {
            result.current.subscribe((e) => received.push(e));
        });
        act(() => {
            result.current.emit('edge.add', { edgeIds: ['e9'] });
        });
        expect(received[0].nodeIds).toEqual([]);
        expect(received[0].edgeIds).toEqual(['e9']);
    });

    // Branch: unsubscribe closure (delete from set).
    it('unsubscribe stops further delivery', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        let unsub: () => void = () => {};
        act(() => {
            unsub = result.current.subscribe((e) => received.push(e));
        });
        act(() => {
            result.current.emit('node.add', { nodeIds: ['a'] });
        });
        expect(received).toHaveLength(1);
        act(() => unsub());
        act(() => {
            result.current.emit('node.add', { nodeIds: ['b'] });
        });
        // No new delivery after unsubscribe.
        expect(received).toHaveLength(1);
    });

    // Branch: a throwing subscriber → catch arm; sibling still fires.
    it('isolates a throwing subscriber so siblings still receive', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const good: any[] = [];
        act(() => {
            result.current.subscribe(() => {
                throw new Error('boom');
            });
            result.current.subscribe((e) => good.push(e));
        });
        act(() => {
            result.current.emit('node.update', { nodeIds: ['x'] });
        });
        // The throwing subscriber didn't block the good one.
        expect(good).toHaveLength(1);
        expect(good[0].nodeIds).toEqual(['x']);
    });

    // Branch: snapshot-before-iterate — a subscriber that unsubscribes
    // itself during dispatch still receives the in-flight event.
    it('a self-unsubscribing subscriber still receives the current event', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        let unsub: () => void = () => {};
        act(() => {
            unsub = result.current.subscribe((e) => {
                received.push(e);
                unsub();
            });
        });
        act(() => {
            result.current.emit('node.remove', { nodeIds: ['z'] });
        });
        expect(received).toHaveLength(1);
        // Subsequent emit must not deliver — it unsubscribed itself.
        act(() => {
            result.current.emit('node.remove', { nodeIds: ['z2'] });
        });
        expect(received).toHaveLength(1);
    });

    // Branch: emitGraphReplace maps ids from the snapshot shape.
    it('emitGraphReplace extracts node and edge ids from the snapshot', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        act(() => {
            result.current.subscribe((e) => received.push(e));
        });
        act(() => {
            result.current.emitGraphReplace({
                nodes: [{ id: 'n1' } as any, { id: 'n2' } as any],
                edges: [{ id: 'e1' } as any],
            });
        });
        expect(received[0].type).toBe('graph.replace');
        expect(received[0].nodeIds).toEqual(['n1', 'n2']);
        expect(received[0].edgeIds).toEqual(['e1']);
    });

    // Branch: emitGraphReplace with empty snapshot.
    it('emitGraphReplace handles an empty snapshot', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        act(() => {
            result.current.subscribe((e) => received.push(e));
        });
        act(() => {
            result.current.emitGraphReplace({ nodes: [], edges: [] });
        });
        expect(received[0].nodeIds).toEqual([]);
        expect(received[0].edgeIds).toEqual([]);
    });

    // Branch: emit with zero subscribers — loop body never runs.
    it('emit with no subscribers does not throw', () => {
        const { result } = renderHook(() => useCanvasChangeEmitter());
        expect(() =>
            act(() => {
                result.current.emit('node.add', { nodeIds: ['a'] });
            }),
        ).not.toThrow();
    });

    // Branch: unmount cleanup effect clears the registry.
    it('clears the registry on unmount', () => {
        const { result, unmount } = renderHook(() => useCanvasChangeEmitter());
        const received: any[] = [];
        const emit = result.current.emit;
        act(() => {
            result.current.subscribe((e) => received.push(e));
        });
        unmount();
        // Registry cleared on unmount — captured emit reference finds an
        // empty set, so nothing is delivered.
        act(() => {
            emit('node.add', { nodeIds: ['after-unmount'] });
        });
        expect(received).toHaveLength(0);
    });
});
