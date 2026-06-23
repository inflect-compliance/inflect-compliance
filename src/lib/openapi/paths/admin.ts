/**
 * Path operations for admin lifecycle (irreversible — contract must
 * not drift): platform-admin tenant bootstrap + ownership transfer,
 * and the per-tenant key-rotation job endpoints.
 * Registered at import time on the shared registry.
 */
import { z } from '@/lib/openapi/zod';
import { registry } from '@/lib/openapi/registry';
import {
    TenantCreateRequestSchema, TenantCreateResponseSchema,
    TenantTransferOwnershipRequestSchema, TenantTransferOwnershipResponseSchema,
    JobStatusResponseSchema,
} from '@/lib/dto/api-extra.dto';
import { EmptyBodySchema } from '@/lib/schemas';
import { responses, jsonBody } from './_shared';

// ─── Platform-admin (X-Platform-Admin-Key gated) ───

registry.registerPath({
    method: 'post',
    path: '/api/admin/tenants',
    summary: 'Create a tenant (platform admin)',
    tags: ['admin'],
    'x-auth': 'platform-admin-api-key',
    'x-rate-limit': 'TENANT_CREATE_LIMIT',
    request: { body: jsonBody(TenantCreateRequestSchema, 'Tenant bootstrap payload.') },
    responses: responses(
        { status: 201, schema: TenantCreateResponseSchema, description: 'The created tenant and its OWNER user id.' },
        ['400', '401', '409', '429'],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/admin/tenants/{slug}/transfer-ownership',
    summary: 'Transfer tenant ownership (platform admin)',
    tags: ['admin'],
    'x-auth': 'platform-admin-api-key',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: {
        params: z.object({ slug: z.string() }),
        body: jsonBody(TenantTransferOwnershipRequestSchema, 'Current owner id + new owner email.'),
    },
    responses: responses(
        { status: 200, schema: TenantTransferOwnershipResponseSchema, description: 'Ownership transferred.' },
        ['400', '401', '404', '409'],
    ),
});

// ─── Per-tenant key rotation (requirePermission-gated, enforced) ───

registry.registerPath({
    method: 'post',
    path: '/api/t/{tenantSlug}/admin/key-rotation',
    summary: 'Enqueue master-KEK re-encryption sweep',
    tags: ['admin'],
    'x-required-permission': 'admin.manage',
    'x-rate-limit': 'API_KEY_CREATE_LIMIT',
    request: { params: z.object({ tenantSlug: z.string() }), body: jsonBody(EmptyBodySchema, 'Empty body — semantics live in the URL.') },
    responses: responses(
        { status: 202, schema: JobStatusResponseSchema, description: 'Rotation sweep enqueued; returns the job handle.' },
        ['401', '403', '429'],
    ),
});

registry.registerPath({
    method: 'get',
    path: '/api/t/{tenantSlug}/admin/key-rotation',
    summary: 'Poll master-KEK rotation job status',
    tags: ['admin'],
    'x-required-permission': 'admin.manage',
    request: { params: z.object({ tenantSlug: z.string() }), query: z.object({ jobId: z.string() }) },
    responses: responses(
        { status: 200, schema: JobStatusResponseSchema, description: 'The BullMQ job state.' },
        ['401', '403', '404'],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/t/{tenantSlug}/admin/tenant-dek-rotation',
    summary: 'Enqueue per-tenant DEK rotation sweep',
    tags: ['admin'],
    'x-required-permission': 'admin.tenant_lifecycle',
    'x-rate-limit': 'API_KEY_CREATE_LIMIT',
    request: { params: z.object({ tenantSlug: z.string() }), body: jsonBody(EmptyBodySchema, 'Empty body — semantics live in the URL.') },
    responses: responses(
        { status: 202, schema: JobStatusResponseSchema, description: 'DEK rotation sweep enqueued; returns the job handle.' },
        ['401', '403', '429'],
    ),
});

registry.registerPath({
    method: 'get',
    path: '/api/t/{tenantSlug}/admin/tenant-dek-rotation',
    summary: 'Poll per-tenant DEK rotation job status',
    tags: ['admin'],
    'x-required-permission': 'admin.tenant_lifecycle',
    request: { params: z.object({ tenantSlug: z.string() }), query: z.object({ jobId: z.string() }) },
    responses: responses(
        { status: 200, schema: JobStatusResponseSchema, description: 'The BullMQ job state.' },
        ['401', '403', '404'],
    ),
});
