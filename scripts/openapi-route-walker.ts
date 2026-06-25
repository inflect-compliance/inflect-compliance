/**
 * Route walker — enumerate `src/app/api/**​/route.ts` and emit OpenAPI
 * path STUB operations for every route the critical-endpoint set
 * (`src/lib/openapi/paths/*`) does NOT already cover.
 *
 * Why this exists: before this, `public/openapi.json` carried only the
 * 26 hand-authored "critical" paths. Swagger UI rendered, but the
 * ~400 remaining routes were invisible — a partner couldn't even SEE
 * that `/api/t/{tenantSlug}/issues/{issueId}/comments` exists. This
 * walker closes the visibility gap: critical routes keep their rich
 * request/response/permission/rate-limit entries; every other route
 * gets a STUB (path + method + path-params + a "schema not yet
 * published" note) so the reference is complete, even where the
 * body/response contract is not yet formally published.
 *
 * Determinism: the caller (`serializeDoc`) sorts `paths` and the
 * per-path method keys, so the committed `public/openapi.json` is
 * byte-stable regardless of filesystem iteration order. We additionally
 * sort here so registration order is stable too (belt and braces).
 *
 * Boundary: this module is build-time only (reads the filesystem). It
 * is imported by `scripts/openapi-build.ts`, never by app code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from '@/lib/openapi/zod';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { ApiErrorResponseSchema } from '@/lib/dto/common';

export type HttpMethodLower = 'get' | 'post' | 'put' | 'patch' | 'delete';
const METHODS: Array<{ name: string; lower: HttpMethodLower }> = [
    { name: 'GET', lower: 'get' },
    { name: 'POST', lower: 'post' },
    { name: 'PUT', lower: 'put' },
    { name: 'PATCH', lower: 'patch' },
    { name: 'DELETE', lower: 'delete' },
];

export interface RouteOperation {
    /** OpenAPI path, e.g. `/api/t/{tenantSlug}/risks/{id}`. */
    path: string;
    /** Lowercase HTTP method. */
    method: HttpMethodLower;
    /** Repo-relative source file, for diagnostics. */
    file: string;
    /** Path-template parameter names, in order. */
    params: string[];
    /** Derived tag for Swagger-UI grouping. */
    tag: string;
}

/** Recursively collect every `route.ts` under `dir`. */
function collectRouteFiles(dir: string): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries.sort()) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory()) {
            out.push(...collectRouteFiles(abs));
        } else if (entry === 'route.ts' || entry === 'route.tsx') {
            out.push(abs);
        }
    }
    return out;
}

/**
 * Convert an App-Router segment to an OpenAPI path segment.
 *   `[tenantSlug]`  → `{tenantSlug}`
 *   `[...nextauth]` → `{nextauth}`   (catch-all)
 *   `(group)`       → ''             (route group — not part of the URL)
 *   `risks`         → `risks`
 */
function segmentToOpenApi(segment: string): string {
    if (segment.startsWith('(') && segment.endsWith(')')) return '';
    if (segment.startsWith('[...') && segment.endsWith(']')) {
        return `{${segment.slice(4, -1)}}`;
    }
    if (segment.startsWith('[[...') && segment.endsWith(']]')) {
        return `{${segment.slice(5, -2)}}`;
    }
    if (segment.startsWith('[') && segment.endsWith(']')) {
        return `{${segment.slice(1, -1)}}`;
    }
    return segment;
}

/** `src/app/api/t/[tenantSlug]/risks/route.ts` → `/api/t/{tenantSlug}/risks`. */
export function fileToOpenApiPath(absFile: string, apiRoot: string): string {
    const relDir = relative(apiRoot, absFile).split(sep).slice(0, -1); // drop `route.ts`
    const segs = relDir.map(segmentToOpenApi).filter(Boolean);
    return segs.length ? `/api/${segs.join('/')}` : '/api';
}

/** Detect which HTTP methods a route file exports (const / function forms). */
export function parseExportedMethods(src: string): string[] {
    const found: string[] = [];
    for (const { name } of METHODS) {
        const re = new RegExp(
            `export\\s+(?:async\\s+)?(?:const\\s+${name}\\s*[:=]|function\\s+${name}\\b)`,
        );
        if (re.test(src)) found.push(name);
    }
    return found;
}

/** Path-template params, in order of appearance. */
export function extractPathParams(openApiPath: string): string[] {
    return Array.from(openApiPath.matchAll(/\{([^}]+)\}/g), (m) => m[1]);
}

/**
 * Tag for Swagger-UI grouping: the first STATIC path segment that
 * isn't the tenant/org routing prefix. Falls back to 'misc'.
 *   `/api/t/{tenantSlug}/risks/{id}` → 'risks'
 *   `/api/admin/feature-flags`       → 'admin'
 *   `/api/auth/{nextauth}`           → 'auth'
 */
export function deriveTag(openApiPath: string): string {
    const segs = openApiPath
        .split('/')
        .filter(Boolean)
        .filter((s) => s !== 'api'); // drop leading 'api'
    for (const s of segs) {
        if (s.startsWith('{')) continue; // param
        if (s === 't' || s === 'o') continue; // tenant/org routing prefix
        return s;
    }
    return 'misc';
}

/** Walk the API tree and return every (path, method) operation found. */
export function walkApiRoutes(apiRoot: string): RouteOperation[] {
    const files = collectRouteFiles(apiRoot);
    const ops: RouteOperation[] = [];
    for (const file of files) {
        const path = fileToOpenApiPath(file, apiRoot);
        const methods = parseExportedMethods(readFileSync(file, 'utf-8'));
        const params = extractPathParams(path);
        const tag = deriveTag(path);
        for (const m of methods) {
            const lower = METHODS.find((x) => x.name === m)!.lower;
            ops.push({ path, method: lower, file: relative(apiRoot, file), params, tag });
        }
    }
    // Stable order: by path, then method.
    ops.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
    return ops;
}

/**
 * Register a STUB operation for every walked route whose (method, path)
 * is NOT already in `existing` (the critical set). Returns the number
 * of stubs registered.
 */
export function registerRouteStubs(
    registry: OpenAPIRegistry,
    apiRoot: string,
): { stubs: number; total: number } {
    // Existing (method, path) pairs already registered by the critical set.
    const existing = new Set<string>();
    for (const def of registry.definitions) {
        const d = def as { type?: string; route?: { method: string; path: string } };
        if (d.type === 'route' && d.route) {
            existing.add(`${d.route.method} ${d.route.path}`);
        }
    }

    const ops = walkApiRoutes(apiRoot);
    let stubs = 0;
    const seen = new Set<string>();
    for (const op of ops) {
        const key = `${op.method} ${op.path}`;
        if (existing.has(key) || seen.has(key)) continue;
        seen.add(key);

        const paramsSchema = op.params.length
            ? z.object(Object.fromEntries(op.params.map((p) => [p, z.string()])))
            : undefined;

        registry.registerPath({
            method: op.method,
            path: op.path,
            summary: `${op.method.toUpperCase()} ${op.path}`,
            description:
                'Stub entry — this route exists but its request/response schema is not yet ' +
                'published in the machine-readable contract. The path, method, and required ' +
                'path parameters are accurate; the body and success shape are not yet formally ' +
                'documented. See `docs/api-consumer-guide.md`. (The critical-endpoint set carries ' +
                'full request/response/permission/rate-limit entries.)',
            tags: [op.tag],
            'x-stub': true,
            ...(paramsSchema ? { request: { params: paramsSchema } } : {}),
            responses: {
                '2XX': {
                    description:
                        'Successful response. The success schema is not yet published in the contract.',
                },
                default: {
                    description: 'Error — see the ErrorResponse envelope.',
                    content: { 'application/json': { schema: ApiErrorResponseSchema } },
                },
            },
        });
        stubs++;
    }
    return { stubs, total: ops.length };
}
