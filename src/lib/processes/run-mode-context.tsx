'use client';

/**
 * Run Mode context (Visual Rule Editor VR-6).
 *
 * "Design" ↔ "Live". In Run Mode the automation canvas overlays live
 * execution state onto nodes/edges and becomes read-only (no node drag / edge
 * creation) so a practitioner watches the workflow run instead of editing it.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface RunModeValue {
    isRunMode: boolean;
    setRunMode: (on: boolean) => void;
}

const RunModeContext = createContext<RunModeValue>({
    isRunMode: false,
    setRunMode: () => {},
});

export function RunModeProvider({ children }: { children: ReactNode }) {
    const [isRunMode, setRunModeRaw] = useState(false);
    const setRunMode = useCallback((on: boolean) => setRunModeRaw(on), []);
    return (
        <RunModeContext.Provider value={{ isRunMode, setRunMode }}>
            {children}
        </RunModeContext.Provider>
    );
}

export function useRunMode(): RunModeValue {
    return useContext(RunModeContext);
}
