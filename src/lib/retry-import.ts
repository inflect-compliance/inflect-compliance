/**
 * Retry a dynamic `import()` on transient chunk-load failure.
 *
 * Next.js `dynamic()` does NOT retry a failed chunk fetch. A single
 * transient failure — a briefly-overwhelmed server under load, a flaky
 * network, a dropped connection — surfaces as `TypeError: Failed to
 * fetch` (or a `ChunkLoadError`) and PERMANENTLY breaks the lazy view
 * until a full page reload. That is both a real user-facing fragility
 * (an `ssr:false` panel silently never renders) and a source of E2E
 * flake for tests that toggle into a lazily-loaded view.
 *
 * This wraps an import factory so a hiccup self-heals in place: on
 * failure it waits a short, exponentially-backed-off delay and retries
 * the SAME `import()` a few times before giving up. A genuinely-missing
 * chunk still rejects after the retries are exhausted, so a real error
 * is never masked — only transient ones are absorbed.
 *
 * Usage — drop-in around a `dynamic()` loader:
 *
 *   const Panel = dynamic(
 *       retryImport(() => import('./Panel').then((m) => m.Panel)),
 *       { ssr: false },
 *   );
 */
export function retryImport<T>(
    factory: () => Promise<T>,
    retries = 3,
    baseDelayMs = 200,
): () => Promise<T> {
    return function load(): Promise<T> {
        return factory().catch((err: unknown) => {
            if (retries <= 0) throw err;
            return new Promise<T>((resolve, reject) => {
                setTimeout(() => {
                    retryImport(factory, retries - 1, baseDelayMs * 2)().then(resolve, reject);
                }, baseDelayMs);
            });
        });
    };
}
