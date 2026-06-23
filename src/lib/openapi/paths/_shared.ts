/**
 * Shared builders for OpenAPI path-operation registration.
 *
 * Route-level contract layer (route-contract snapshots). Until this
 * landed, the OpenAPI document carried only component schemas and
 * zero `paths` — no operation tied a method+path to its request body,
 * response shape, error codes, required permission, and rate-limit
 * preset. These helpers register the ~47 "critical" operations (the
 * published contract external SDK / auditor consumers call) by
 * `$ref`-ing the EXISTING request/response components in
 * `src/lib/schemas` + `src/lib/dto/*`.
 *
 * Derivation boundary: request bodies + response DTOs are referenced
 * from their real component definitions (a field change there shows
 * up in the snapshot). Query parameters are authored here — the
 * routes' inline query schemas carry `.transform(...)` calls that are
 * unsuitable for direct OpenAPI parameter emission, and the query
 * surface is the least contract-critical part. `x-required-permission`
 * + `x-rate-limit` document the authz/throttle contract; for tenant
 * CRUD the permission key becomes ENFORCED in the follow-up authz PR.
 */
import { z } from '@/lib/openapi/zod';
import { ApiErrorResponseSchema, SuccessResponseSchema } from '@/lib/dto/common';

/**
 * Minimal ResponseConfig surface. The `'application/json'` key must be
 * a string LITERAL (not a `string`-typed variable) to satisfy the
 * library's branded `ZodMediaType` index, and `schema` must be a Zod
 * type, not `unknown`.
 */
type ResponseEntry = {
    description: string;
    content?: { 'application/json': { schema: z.ZodTypeAny } };
};

const ERROR_DESCRIPTIONS: Record<string, string> = {
    '400': 'Validation error — the request body or query failed schema validation.',
    '401': 'Unauthenticated — no valid session or API credential.',
    '403': 'Forbidden — authenticated but lacking the required permission.',
    '404': 'Not found — no such resource in this tenant.',
    '409': 'Conflict — the request collides with current state (e.g. a guard or uniqueness constraint).',
    '429': 'Rate limited — too many requests; see the Retry-After header.',
};

/** A single error response entry referencing the shared ErrorResponse component. */
export function errorEntry(code: string): ResponseEntry {
    return {
        description: ERROR_DESCRIPTIONS[code] ?? 'Error',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
    };
}

/**
 * Assemble a `responses` map: one success entry plus an ErrorResponse
 * entry per documented error code.
 */
export function responses(success: { status: number; schema: z.ZodTypeAny; description: string }, errors: string[]): Record<string, ResponseEntry> {
    const out: Record<string, ResponseEntry> = {
        [String(success.status)]: {
            description: success.description,
            content: { 'application/json': { schema: success.schema } },
        },
    };
    for (const code of errors) out[code] = errorEntry(code);
    return out;
}

/** A 200 success carrying the shared SuccessResponse component (for DELETEs). */
export function okSuccess(description: string): { status: number; schema: z.ZodTypeAny; description: string } {
    return { status: 200, schema: SuccessResponseSchema, description };
}

/** Request body wrapper around an existing request-schema component. */
export function jsonBody(schema: z.ZodTypeAny, description: string) {
    return { description, required: true, content: { 'application/json': { schema } } };
}

/**
 * The backfill-cap list envelope every tenant list GET returns
 * (`{ rows, truncated }` from `applyBackfillCap`). Inlined per-call so
 * the item schema `$ref`s the real DTO component.
 */
export function cappedList(itemSchema: z.ZodTypeAny, itemName: string): z.ZodTypeAny {
    return z.object({
        rows: z.array(itemSchema),
        truncated: z.boolean(),
    }).openapi(`${itemName}ListResponse`, {
        description: `Backfill-capped list of ${itemName}. \`truncated\` is true when the result hit LIST_BACKFILL_CAP and the client should refine filters.`,
    });
}

/** Authored query parameters shared by the tenant list endpoints. */
export const ListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    status: z.string().optional(),
    q: z.string().optional(),
    includeDeleted: z.enum(['true', 'false']).optional(),
});

/** Standard error-code sets, by operation kind. */
export const ERRORS = {
    list: ['400', '401', '403', '429'],
    create: ['400', '401', '403', '409', '429'],
    detail: ['401', '403', '404', '429'],
    update: ['400', '401', '403', '404', '409', '429'],
    remove: ['401', '403', '404', '429'],
} as const;
