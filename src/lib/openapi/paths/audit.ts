/**
 * Path operations for audits + evidence packs (consumed by external
 * auditors). Registered at import time on the shared registry.
 */
import { z } from '@/lib/openapi/zod';
import { registry } from '@/lib/openapi/registry';
import { CreateAuditSchema, UpdateAuditSchema } from '@/lib/schemas';
import { AuditDTOSchema } from '@/lib/dto/audit.dto';
import {
    AuditPackCreateRequestSchema, AuditPackUpdateRequestSchema,
    AuditPackResponseSchema, SharedAuditPackResponseSchema,
} from '@/lib/dto/api-extra.dto';
import { responses, jsonBody, cappedList, ListQuerySchema, ERRORS } from './_shared';

const tenantParams = z.object({ tenantSlug: z.string() });

// ─── Audit cycles ───

registry.registerPath({
    method: 'get',
    path: '/api/t/{tenantSlug}/audits',
    summary: 'List audit cycles',
    tags: ['audits'],
    'x-required-permission': 'audits.view',
    'x-rate-limit': 'API_READ_LIMIT',
    request: { params: tenantParams, query: ListQuerySchema },
    responses: responses(
        { status: 200, schema: cappedList(AuditDTOSchema, 'Audit'), description: 'Backfill-capped list of audit cycles.' },
        [...ERRORS.list],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/t/{tenantSlug}/audits',
    summary: 'Create an audit cycle',
    tags: ['audits'],
    'x-required-permission': 'audits.manage',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: { params: tenantParams, body: jsonBody(CreateAuditSchema, 'Audit cycle payload.') },
    responses: responses(
        { status: 201, schema: AuditDTOSchema, description: 'The created audit cycle.' },
        [...ERRORS.create],
    ),
});

registry.registerPath({
    method: 'get',
    path: '/api/t/{tenantSlug}/audits/{id}',
    summary: 'Get an audit cycle',
    tags: ['audits'],
    'x-required-permission': 'audits.view',
    'x-rate-limit': 'API_READ_LIMIT',
    request: { params: z.object({ tenantSlug: z.string(), id: z.string() }) },
    responses: responses(
        { status: 200, schema: AuditDTOSchema, description: 'The audit cycle.' },
        [...ERRORS.detail],
    ),
});

registry.registerPath({
    method: 'put',
    path: '/api/t/{tenantSlug}/audits/{id}',
    summary: 'Update an audit cycle',
    tags: ['audits'],
    'x-required-permission': 'audits.manage',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: { params: z.object({ tenantSlug: z.string(), id: z.string() }), body: jsonBody(UpdateAuditSchema, 'Audit cycle update (incl. status transitions + checklist rows).') },
    responses: responses(
        { status: 200, schema: AuditDTOSchema, description: 'The updated audit cycle.' },
        [...ERRORS.update],
    ),
});

// ─── Audit packs ───

registry.registerPath({
    method: 'get',
    path: '/api/t/{tenantSlug}/audits/packs',
    summary: 'List audit packs',
    tags: ['audits'],
    'x-required-permission': 'audits.view',
    'x-rate-limit': 'API_READ_LIMIT',
    request: { params: tenantParams, query: z.object({ cycleId: z.string().optional() }) },
    responses: responses(
        { status: 200, schema: z.array(AuditPackResponseSchema).openapi('AuditPackListResponse', { description: 'Audit packs for the tenant, optionally filtered by cycleId.' }), description: 'Audit packs (with _count + cycle summary).' },
        [...ERRORS.list],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/t/{tenantSlug}/audits/packs',
    summary: 'Create an audit pack',
    tags: ['audits'],
    'x-required-permission': 'audits.manage',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: { params: tenantParams, body: jsonBody(AuditPackCreateRequestSchema, 'Pack create payload (bound to an audit cycle).') },
    responses: responses(
        { status: 201, schema: AuditPackResponseSchema, description: 'The created audit pack.' },
        [...ERRORS.create],
    ),
});

registry.registerPath({
    method: 'get',
    path: '/api/t/{tenantSlug}/audits/packs/{packId}',
    summary: 'Get an audit pack',
    tags: ['audits'],
    'x-required-permission': 'audits.view',
    'x-rate-limit': 'API_READ_LIMIT',
    request: { params: z.object({ tenantSlug: z.string(), packId: z.string() }), query: z.object({ action: z.enum(['export']).optional() }) },
    responses: responses(
        { status: 200, schema: AuditPackResponseSchema, description: 'The audit pack detail (items[], cycle, frozenBy). ?action=export streams the rendered pack instead.' },
        [...ERRORS.detail],
    ),
});

registry.registerPath({
    method: 'patch',
    path: '/api/t/{tenantSlug}/audits/packs/{packId}',
    summary: 'Update audit-pack metadata',
    tags: ['audits'],
    'x-required-permission': 'audits.manage',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: { params: z.object({ tenantSlug: z.string(), packId: z.string() }), body: jsonBody(AuditPackUpdateRequestSchema, 'Metadata update. Item membership / freeze / share / clone are action-multiplexed POST ?action=… on this path.') },
    responses: responses(
        { status: 200, schema: AuditPackResponseSchema, description: 'The updated audit pack.' },
        [...ERRORS.update],
    ),
});

// ─── Public shared pack (token-gated) ───

registry.registerPath({
    method: 'get',
    path: '/api/audit/shared/{token}',
    summary: 'Read a shared audit pack (public)',
    tags: ['audits'],
    'x-auth': 'share-token',
    request: { params: z.object({ token: z.string() }) },
    responses: responses(
        { status: 200, schema: SharedAuditPackResponseSchema, description: 'The frozen, share-token-scoped pack view.' },
        ['401', '404', '429'],
    ),
});
