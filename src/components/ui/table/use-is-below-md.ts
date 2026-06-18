"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is below Tailwind's `md` breakpoint (768px) — i.e. a
 * phone. Used by `<DataTable>` to swap the wide table for a stacked card list.
 *
 * Starts `false` on SSR + first client render (hydration-safe), then resolves
 * on mount via `matchMedia('(max-width: 767.98px)')`. Two consequences that
 * matter:
 *   - On a real phone the table paints for one frame, then swaps to cards — the
 *     same pattern the Modal/Sheet responsive presentation uses.
 *   - Under jsdom (no real viewport) `matchMedia(...).matches` is `false`, so
 *     tests render the DESKTOP table by default — exactly what the existing
 *     table/entity-page tests expect. A test that wants the card view mocks
 *     this hook to return `true`.
 */
export function useIsBelowMd(): boolean {
    const [belowMd, setBelowMd] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mql = window.matchMedia("(max-width: 767.98px)");
        const sync = () => setBelowMd(mql.matches);
        sync();
        mql.addEventListener("change", sync);
        return () => mql.removeEventListener("change", sync);
    }, []);

    return belowMd;
}
