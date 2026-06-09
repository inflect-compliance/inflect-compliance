/**
 * Shared jsdom shims, wired as `setupFilesAfterEnv` for any Jest
 * project that may have a jsdom window at test time.
 *
 * Kept as a thin file so both projects can share one source of truth:
 *   - jest.config.js `node` project pulls this in so the handful of
 *     tests using `@jest-environment jsdom` per-file (e.g.
 *     `tests/unit/form-telemetry.test.ts`) don't emit jsdom
 *     "Not implemented" noise.
 *   - `tests/rendered/setup.ts` imports this at the top so the full
 *     RTL suite picks up the same shims before its axe / testing-
 *     library bootstrap.
 *
 * Every shim is feature-detected so this file is safe to load in a
 * pure-node environment too.
 */

// Default per-test timeout for BOTH projects (the jsdom project's
// `tests/rendered/setup.ts` imports this file). Jest's 5s default is
// too tight for DB-backed integration tests and heavy render tests
// under full-suite parallel load — they pass solo but starve when the
// whole suite runs. 30s gives realistic headroom without masking a
// genuine hang. A project-level `testTimeout` in jest.config is
// IGNORED, so it must be set here. Per-file `jest.setTimeout(...)`
// (e.g. framework-import-cli's CLI spawn) still overrides this.
jest.setTimeout(30_000);

if (typeof window !== 'undefined') {
    // motion-dom's KeyframesResolver.measureAllKeyframes probes
    // `window.scrollTo` on each animation-frame tick. jsdom's default
    // throws "Not implemented", which spams console.error in any
    // render test that mounts a <motion.*> component or anything
    // transitively animated by `motion` (TrendCard, Accordion, Modal,
    // Sheet, micro-visuals). defineProperty is used so we override
    // jsdom's prototype-level method on the instance even if jsdom
    // exposes it as a non-writable descriptor.
    Object.defineProperty(window, 'scrollTo', {
        value: () => {},
        writable: true,
        configurable: true,
    });
}
