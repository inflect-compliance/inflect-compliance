/**
 * Coerce an API error response body to a human-readable string.
 *
 * The API error envelope is `{ error: { code, message, requestId } }` (see
 * `src/lib/errors/types.ts::toApiErrorResponse`). A common client mistake is
 * `setError(body.error ?? fallback)` — but `body.error` is an OBJECT, and
 * pushing it into React state then rendering it throws
 * "Minified React error #31 — objects are not valid as a React child", which
 * trips the page error boundary ("Something went wrong"). It only fires on a
 * 4xx/5xx response, so it hides until a real error path is exercised.
 *
 * Always route a parsed error-response body through this before `setError()`,
 * a toast, or any other render path. Handles all three shapes seen in the wild:
 * the canonical `{ error: { message } }` envelope, a flat `{ error: 'string' }`,
 * and a bare `{ message: 'string' }`.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === 'object') {
        const b = body as { error?: unknown; message?: unknown };
        if (typeof b.error === 'string') return b.error;
        if (b.error && typeof b.error === 'object') {
            const inner = b.error as { message?: unknown };
            if (typeof inner.message === 'string') return inner.message;
        }
        if (typeof b.message === 'string') return b.message;
    }
    return fallback;
}
