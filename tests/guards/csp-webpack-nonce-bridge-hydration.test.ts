/**
 * CSP webpack-nonce bridge — `suppressHydrationWarning` is
 * load-bearing.
 *
 * Browsers strip the `nonce` attribute from DOM elements AFTER CSP
 * processing (HTML spec — `nonce` is a one-time secret that must
 * never be readable from JavaScript). React's hydration then
 * compares SSR-emitted `nonce="…"` to client-visible `nonce=""`
 * and emits a console error: "tree hydrated but some attributes
 * didn't match." Hydration ITSELF still succeeds — the bridge
 * sets `__webpack_nonce__` before any chunk loads — but headless
 * QA tools that abort on the first console error misinterpret
 * this as a hard hydration failure.
 *
 * The 2026-05-25 QA pass marked Sidebar / Forms / Mobile sections
 * as BLOCKED due to "JS hydration failure". The 2026-05-27
 * investigation reproduced the issue and found it was THIS
 * warning, not a CSP block. Adding `suppressHydrationWarning` to
 * the bridge tells React the attribute legitimately differs.
 *
 * A future "tidy-up" PR that removes the attribute would resurface
 * the warning on every page load → fresh QA reports the same
 * "BLOCKED" status → ratchet says no.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf-8");

describe("CSP webpack-nonce bridge — hydration warning suppression", () => {
    const src = () => read("src/app/layout.tsx");

    it("the bridge script tag carries `suppressHydrationWarning`", () => {
        const s = src();
        // Anchor on the script's defining markers (nonce={nonce} +
        // __webpack_nonce__ in the inline content) and require
        // `suppressHydrationWarning` appears between them.
        const start = s.indexOf("nonce={nonce}");
        expect(start).toBeGreaterThan(-1);
        const end = s.indexOf("__webpack_nonce__", start);
        expect(end).toBeGreaterThan(start);
        const block = s.slice(start, end);
        expect(block).toMatch(/suppressHydrationWarning/);
    });

    it("the bridge still sets __webpack_nonce__ via inline script", () => {
        // The hydration-warning fix MUST NOT accidentally drop the
        // bridge itself — that would re-break the strict-dynamic
        // chunk-loading path the bridge exists to fix (per the
        // 2026-05-14 impl note).
        const s = src();
        expect(s).toMatch(/window\.__webpack_nonce__=/);
        expect(s).toMatch(/globalThis\.__webpack_nonce__=/);
    });

    it("the bridge stays gated on the request nonce being present", () => {
        // `{nonce && (...)}` means we never emit a bare `nonce=""`
        // attribute (which would itself be a CSP failure mode).
        const s = src();
        expect(s).toMatch(/\{nonce && \(/);
    });
});
