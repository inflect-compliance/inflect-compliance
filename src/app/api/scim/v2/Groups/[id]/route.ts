/**
 * SCIM 2.0 single Group endpoint (EI-3).
 * GET / PUT / PATCH / DELETE /api/scim/v2/Groups/:id
 */
import { NextRequest } from 'next/server';
import { authenticateScimRequest, ScimAuthError } from '@/lib/scim/auth';
import { scimError } from '@/lib/scim/types';
import {
    scimGetGroup,
    scimReplaceGroup,
    scimPatchGroup,
    scimDeleteGroup,
    scimGroupResource,
} from '@/app-layer/usecases/scim-groups';
import { jsonResponse } from '@/lib/api-response';

const SCIM = { 'Content-Type': 'application/scim+json' };

async function handle<T>(fn: () => Promise<T>): Promise<Response> {
    try {
        return (await fn()) as unknown as Response;
    } catch (e) {
        if (e instanceof ScimAuthError) {
            return jsonResponse(scimError(e.status, e.message, e.scimType), { status: e.status });
        }
        return jsonResponse(scimError(500, 'Internal server error'), { status: 500 });
    }
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return handle(async () => {
        const ctx = await authenticateScimRequest(req);
        const { id } = await params;
        const group = await scimGetGroup(ctx, id);
        if (!group) return jsonResponse(scimError(404, 'Group not found'), { status: 404 });
        return jsonResponse(scimGroupResource(group), { headers: SCIM });
    });
}

export function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return handle(async () => {
        const ctx = await authenticateScimRequest(req);
        const { id } = await params;
        const body = (await req.json()) as {
            displayName?: string;
            members?: Array<{ value: string }>;
        };
        const group = await scimReplaceGroup(ctx, id, body);
        if (!group) return jsonResponse(scimError(404, 'Group not found'), { status: 404 });
        return jsonResponse(scimGroupResource(group), { headers: SCIM });
    });
}

export function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return handle(async () => {
        const ctx = await authenticateScimRequest(req);
        const { id } = await params;
        const body = (await req.json()) as {
            Operations?: Array<{ op: string; path?: string; value?: unknown }>;
        };
        if (!Array.isArray(body.Operations)) {
            return jsonResponse(scimError(400, 'Operations is required', 'invalidValue'), { status: 400 });
        }
        const group = await scimPatchGroup(ctx, id, body.Operations);
        if (!group) return jsonResponse(scimError(404, 'Group not found'), { status: 404 });
        return jsonResponse(scimGroupResource(group), { headers: SCIM });
    });
}

export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return handle(async () => {
        const ctx = await authenticateScimRequest(req);
        const { id } = await params;
        const res = await scimDeleteGroup(ctx, id);
        if (!res.ok) return jsonResponse(scimError(404, 'Group not found'), { status: 404 });
        return new Response(null, { status: 204 });
    });
}
