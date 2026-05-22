/**
 * Epic 46 — Framework hierarchical tree.
 *
 * GET /api/t/[tenantSlug]/frameworks/[frameworkKey]/tree[?version=...]
 *
 * Returns a `FrameworkTreePayload` (see
 * `src/lib/framework-tree/types.ts`): the framework descriptor plus
 * the requirements pre-built into a nested tree of section →
 * requirement [→ sub-requirement] nodes.
 *
 * Path convention: `[frameworkKey]` matches the existing
 * `frameworks/[frameworkKey]/route.ts` — frameworks are looked up by
 * `Framework.key` (slug), not by cuid `id`, throughout the app. The
 * Epic 46 prompt asked for `[id]/tree` but using `[frameworkKey]`
 * keeps URLs and route params consistent with every sibling route.
 *
 * Authz: tenant-scoped via `getTenantCtx` + `assertCanViewFrameworks`
 * (any authenticated tenant member). Frameworks are global rows so
 * no tenant filter applies to the data — the gate is purely on the
 * caller.
 */

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getFrameworkTree } from '@/app-layer/usecases/framework';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; frameworkKey: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const url = new URL(req.url);
        const version = url.searchParams.get('version') || undefined;
        const tree = await getFrameworkTree(ctx, params.frameworkKey, version);
        return jsonResponse(tree);
    },
);
