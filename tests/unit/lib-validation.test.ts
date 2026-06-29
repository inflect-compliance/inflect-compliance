/**
 * Unit tests for src/lib/validation.ts — request body validation helpers.
 *
 * (Distinct from tests/unit/validation.test.ts, which covers the unrelated
 * `@/lib/validation/route` wrappers. This file targets the top-level
 * `@/lib/validation` module — `validationError` + `parseBody`.)
 *
 * Covers every branch:
 *   - validationError → 400 NextResponse with mapped issues
 *   - parseBody happy path (valid body → typed data, error: null)
 *   - parseBody strips unknown fields
 *   - parseBody schema mismatch → validationError 400
 *   - parseBody malformed JSON (req.json() throws → 400, empty issues)
 */
import { z } from 'zod';
import { validationError, parseBody } from '@/lib/validation';

const Schema = z.object({
    name: z.string(),
    age: z.number().int().positive(),
});

function jsonRequest(body: string): Request {
    return new Request('http://localhost/x', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
    });
}

describe('validationError', () => {
    it('returns a 400 NextResponse with the standard error shape and mapped issues', async () => {
        const parsed = Schema.safeParse({ name: 123, age: -1 });
        expect(parsed.success).toBe(false);
        if (parsed.success) throw new Error('expected parse failure');

        const res = validationError(parsed.error);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.message).toBe('Invalid request body');
        expect(Array.isArray(body.issues)).toBe(true);
        expect(body.issues.length).toBeGreaterThan(0);
        // Each issue carries path/code/message projected from the ZodError.
        for (const issue of body.issues) {
            expect(issue).toHaveProperty('path');
            expect(issue).toHaveProperty('code');
            expect(issue).toHaveProperty('message');
            expect(typeof issue.message).toBe('string');
        }
        // The `name` field failure is present in the issue paths.
        const paths = body.issues.map((i: { path: unknown[] }) => i.path.join('.'));
        expect(paths).toContain('name');
    });
});

describe('parseBody', () => {
    it('resolves parsed, typed data with error: null for a valid body', async () => {
        const req = jsonRequest(JSON.stringify({ name: 'Ada', age: 30 }));
        const result = await parseBody(req, Schema);

        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'Ada', age: 30 });
    });

    it('strips unknown fields by default', async () => {
        const req = jsonRequest(
            JSON.stringify({ name: 'Ada', age: 30, extra: 'dropped' }),
        );
        const result = await parseBody(req, Schema);

        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'Ada', age: 30 });
        expect(result.data).not.toHaveProperty('extra');
    });

    it('returns a 400 validation error for a body that fails the schema', async () => {
        const req = jsonRequest(JSON.stringify({ name: 'Ada', age: -5 }));
        const result = await parseBody(req, Schema);

        expect(result.data).toBeNull();
        expect(result.error).not.toBeNull();
        const res = result.error!;
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.message).toBe('Invalid request body');
        expect(body.issues.length).toBeGreaterThan(0);
    });

    it('returns a 400 "Invalid JSON" error for a malformed JSON body', async () => {
        const req = jsonRequest('{ not valid json');
        const result = await parseBody(req, Schema);

        expect(result.data).toBeNull();
        expect(result.error).not.toBeNull();
        const res = result.error!;
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.message).toBe('Invalid JSON in request body');
        expect(body.issues).toEqual([]);
    });
});
