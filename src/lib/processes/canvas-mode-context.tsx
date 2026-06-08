'use client';

/**
 * Canvas mode context (VR-2).
 *
 * The active `ProcessMap.canvasMode` (DOCUMENT vs AUTOMATION) threaded to
 * every canvas child so the palette, inspector, edge UI, and toolbar can
 * gate automation-only affordances. The same xyflow canvas serves both
 * surfaces; this context is the single discriminator.
 */
import { createContext, useContext, type ReactNode } from 'react';

export type CanvasMode = 'DOCUMENT' | 'AUTOMATION';

const CanvasModeContext = createContext<CanvasMode>('DOCUMENT');

export function CanvasModeProvider({
    mode,
    children,
}: {
    mode: CanvasMode;
    children: ReactNode;
}) {
    return <CanvasModeContext.Provider value={mode}>{children}</CanvasModeContext.Provider>;
}

export function useCanvasMode(): CanvasMode {
    return useContext(CanvasModeContext);
}

export function useIsAutomationMode(): boolean {
    return useContext(CanvasModeContext) === 'AUTOMATION';
}
