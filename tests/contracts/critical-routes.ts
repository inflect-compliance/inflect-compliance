/**
 * The CRITICAL_SET — the published route-level contract.
 *
 * Single source of truth for which (method, path) operations are
 * snapshotted by `route-contracts.test.ts` and enforced by
 * `tests/guards/route-contract-coverage.test.ts`. Each entry is
 * `"<METHOD> <openapi-path>"` (method uppercase; path uses OpenAPI
 * `{param}` templating, NOT Next's `[param]`).
 *
 * The guard asserts the built OpenAPI document's operation set EQUALS
 * this list — a new critical route shipped without a path
 * registration fails CI, and a registration not listed here fails too
 * (keeps the published surface curated). The other ~380 routes
 * (internal admin, health probes, webhook receivers) are intentionally
 * NOT in this set and can refactor freely.
 */
export const CRITICAL_OPERATIONS: readonly string[] = [
    // ─── Tenant entity CRUD ───
    'GET /api/t/{tenantSlug}/risks',
    'POST /api/t/{tenantSlug}/risks',
    'GET /api/t/{tenantSlug}/risks/{id}',
    'PUT /api/t/{tenantSlug}/risks/{id}',
    'DELETE /api/t/{tenantSlug}/risks/{id}',
    'GET /api/t/{tenantSlug}/controls',
    'POST /api/t/{tenantSlug}/controls',
    'GET /api/t/{tenantSlug}/controls/{controlId}',
    'PATCH /api/t/{tenantSlug}/controls/{controlId}',
    'GET /api/t/{tenantSlug}/tasks',
    'POST /api/t/{tenantSlug}/tasks',
    'GET /api/t/{tenantSlug}/tasks/{taskId}',
    'PATCH /api/t/{tenantSlug}/tasks/{taskId}',
    'DELETE /api/t/{tenantSlug}/tasks/{taskId}',
    'GET /api/t/{tenantSlug}/assets',
    'POST /api/t/{tenantSlug}/assets',
    'GET /api/t/{tenantSlug}/assets/{id}',
    'PUT /api/t/{tenantSlug}/assets/{id}',
    'DELETE /api/t/{tenantSlug}/assets/{id}',
    'GET /api/t/{tenantSlug}/policies',
    'POST /api/t/{tenantSlug}/policies',
    'GET /api/t/{tenantSlug}/policies/{id}',
    'PATCH /api/t/{tenantSlug}/policies/{id}',
    'GET /api/t/{tenantSlug}/vendors',
    'POST /api/t/{tenantSlug}/vendors',
    'GET /api/t/{tenantSlug}/vendors/{vendorId}',
    'PATCH /api/t/{tenantSlug}/vendors/{vendorId}',

    // ─── Auth boundary ───
    'POST /api/auth/register',
    'POST /api/auth/change-password',
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password',
    'GET /api/auth/me',

    // ─── Admin lifecycle (irreversible) ───
    'POST /api/admin/tenants',
    'POST /api/admin/tenants/{slug}/transfer-ownership',
    'POST /api/t/{tenantSlug}/admin/key-rotation',
    'GET /api/t/{tenantSlug}/admin/key-rotation',
    'POST /api/t/{tenantSlug}/admin/tenant-dek-rotation',
    'GET /api/t/{tenantSlug}/admin/tenant-dek-rotation',

    // ─── Audit + evidence pack (external auditors) ───
    'GET /api/t/{tenantSlug}/audits',
    'POST /api/t/{tenantSlug}/audits',
    'GET /api/t/{tenantSlug}/audits/{id}',
    'PUT /api/t/{tenantSlug}/audits/{id}',
    'GET /api/t/{tenantSlug}/audits/packs',
    'POST /api/t/{tenantSlug}/audits/packs',
    'GET /api/t/{tenantSlug}/audits/packs/{packId}',
    'PATCH /api/t/{tenantSlug}/audits/packs/{packId}',
    'GET /api/audit/shared/{token}',
];

/** Enumerate "<METHOD> <path>" operation keys from a built OpenAPI doc. */
export function enumerateOperations(doc: { paths?: Record<string, Record<string, unknown>> }): string[] {
    const ops: string[] = [];
    for (const [path, methods] of Object.entries(doc.paths ?? {})) {
        for (const method of Object.keys(methods)) {
            ops.push(`${method.toUpperCase()} ${path}`);
        }
    }
    return ops.sort();
}

/**
 * Enumerate only the NON-STUB operations — the richly-documented
 * surface. The route-walker (`scripts/openapi-route-walker.ts`) emits
 * `x-stub: true` operations for every route outside the curated
 * CRITICAL_SET so the published spec is complete; those are excluded
 * here so the coverage guard can assert the *curated* surface equals
 * CRITICAL_SET without counting stubs.
 */
export function enumerateNonStubOperations(doc: { paths?: Record<string, Record<string, unknown>> }): string[] {
    const ops: string[] = [];
    for (const [path, methods] of Object.entries(doc.paths ?? {})) {
        for (const [method, op] of Object.entries(methods)) {
            if (op && typeof op === 'object' && (op as { 'x-stub'?: unknown })['x-stub']) continue;
            ops.push(`${method.toUpperCase()} ${path}`);
        }
    }
    return ops.sort();
}
