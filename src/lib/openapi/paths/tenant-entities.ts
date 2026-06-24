/**
 * Path operations for the six tenant-scoped CRUD entities
 * (risks, controls, tasks, assets, policies, vendors).
 *
 * Registered at import time on the shared registry. The builder
 * (`scripts/openapi-build.ts`) imports `@/lib/openapi/paths` so these
 * run; `serializeDoc` sorts `paths` for byte-stable output.
 */
import { z } from '@/lib/openapi/zod';
import { registry } from '@/lib/openapi/registry';
import {
    CreateRiskSchema, UpdateRiskSchema,
    CreateControlSchema, UpdateControlSchema,
    CreateTaskSchema, UpdateTaskSchema,
    CreateAssetSchema, UpdateAssetSchema,
    CreatePolicySchema, UpdatePolicyMetadataSchema,
    CreateVendorSchema, UpdateVendorSchema,
} from '@/lib/schemas';
import { RiskListItemDTOSchema, RiskDetailDTOSchema } from '@/lib/dto/risk.dto';
import { ControlListItemDTOSchema, ControlDetailDTOSchema } from '@/lib/dto/control.dto';
import { TaskDTOSchema } from '@/lib/dto/task.dto';
import { AssetListItemDTOSchema, AssetDetailDTOSchema } from '@/lib/dto/asset.dto';
import { PolicyListItemDTOSchema, PolicyDetailDTOSchema } from '@/lib/dto/policy.dto';
import { VendorListItemDTOSchema, VendorDetailDTOSchema } from '@/lib/dto/vendor.dto';
import { responses, okSuccess, jsonBody, cappedList, ListQuerySchema, ERRORS } from './_shared';

const tenantParams = z.object({ tenantSlug: z.string() });

interface EntityCfg {
    resource: string;          // URL segment, e.g. 'risks'
    label: string;             // human noun, e.g. 'risk'
    entityName: string;        // PascalCase singular, e.g. 'Risk' → 'RiskListResponse'
    detailParam: string;       // 'id' | 'controlId' | …
    permission: string;        // permission namespace, e.g. 'risks' → risks.view/.create/.edit
    listItem: z.ZodTypeAny;
    detail: z.ZodTypeAny;
    createBody: z.ZodTypeAny;
    updateBody: z.ZodTypeAny;
    updateMethod: 'put' | 'patch';
    hasDelete: boolean;
}

const READ_LIMIT = 'API_READ_LIMIT';
const MUTATION_LIMIT = 'API_MUTATION_LIMIT';

function registerEntity(cfg: EntityCfg): void {
    const base = `/api/t/{tenantSlug}/${cfg.resource}`;
    const detailPath = `${base}/{${cfg.detailParam}}`;
    const detailParams = z.object({ tenantSlug: z.string(), [cfg.detailParam]: z.string() });

    // List
    registry.registerPath({
        method: 'get',
        path: base,
        summary: `List ${cfg.resource}`,
        tags: [cfg.resource],
        'x-required-permission': `${cfg.permission}.view`,
        'x-rate-limit': READ_LIMIT,
        request: { params: tenantParams, query: ListQuerySchema },
        responses: responses(
            { status: 200, schema: cappedList(cfg.listItem, cfg.entityName), description: `Backfill-capped list of ${cfg.label}s.` },
            [...ERRORS.list],
        ),
    });

    // Create
    registry.registerPath({
        method: 'post',
        path: base,
        summary: `Create a ${cfg.label}`,
        tags: [cfg.resource],
        'x-required-permission': `${cfg.permission}.create`,
        'x-rate-limit': MUTATION_LIMIT,
        request: { params: tenantParams, body: jsonBody(cfg.createBody, `Payload to create a ${cfg.label}.`) },
        responses: responses(
            { status: 201, schema: cfg.detail, description: `The created ${cfg.label}.` },
            [...ERRORS.create],
        ),
    });

    // Detail GET
    registry.registerPath({
        method: 'get',
        path: detailPath,
        summary: `Get a ${cfg.label}`,
        tags: [cfg.resource],
        'x-required-permission': `${cfg.permission}.view`,
        'x-rate-limit': READ_LIMIT,
        request: { params: detailParams },
        responses: responses(
            { status: 200, schema: cfg.detail, description: `The ${cfg.label}.` },
            [...ERRORS.detail],
        ),
    });

    // Update (PUT or PATCH)
    registry.registerPath({
        method: cfg.updateMethod,
        path: detailPath,
        summary: `Update a ${cfg.label}`,
        tags: [cfg.resource],
        'x-required-permission': `${cfg.permission}.edit`,
        'x-rate-limit': MUTATION_LIMIT,
        request: { params: detailParams, body: jsonBody(cfg.updateBody, `Partial update for a ${cfg.label}.`) },
        responses: responses(
            { status: 200, schema: cfg.detail, description: `The updated ${cfg.label}.` },
            [...ERRORS.update],
        ),
    });

    // Delete (only where the route exists)
    if (cfg.hasDelete) {
        registry.registerPath({
            method: 'delete',
            path: detailPath,
            summary: `Delete a ${cfg.label}`,
            tags: [cfg.resource],
            'x-required-permission': `${cfg.permission}.edit`,
            'x-rate-limit': MUTATION_LIMIT,
            request: { params: detailParams },
            responses: responses(okSuccess(`The ${cfg.label} was soft-deleted.`), [...ERRORS.remove]),
        });
    }
}

const ENTITIES: EntityCfg[] = [
    { resource: 'risks', label: 'risk', entityName: 'Risk', detailParam: 'id', permission: 'risks', listItem: RiskListItemDTOSchema, detail: RiskDetailDTOSchema, createBody: CreateRiskSchema, updateBody: UpdateRiskSchema, updateMethod: 'put', hasDelete: true },
    { resource: 'controls', label: 'control', entityName: 'Control', detailParam: 'controlId', permission: 'controls', listItem: ControlListItemDTOSchema, detail: ControlDetailDTOSchema, createBody: CreateControlSchema, updateBody: UpdateControlSchema, updateMethod: 'patch', hasDelete: false },
    { resource: 'tasks', label: 'task', entityName: 'Task', detailParam: 'taskId', permission: 'tasks', listItem: TaskDTOSchema, detail: TaskDTOSchema, createBody: CreateTaskSchema, updateBody: UpdateTaskSchema, updateMethod: 'patch', hasDelete: true },
    { resource: 'assets', label: 'asset', entityName: 'Asset', detailParam: 'id', permission: 'assets', listItem: AssetListItemDTOSchema, detail: AssetDetailDTOSchema, createBody: CreateAssetSchema, updateBody: UpdateAssetSchema, updateMethod: 'put', hasDelete: true },
    { resource: 'policies', label: 'policy', entityName: 'Policy', detailParam: 'id', permission: 'policies', listItem: PolicyListItemDTOSchema, detail: PolicyDetailDTOSchema, createBody: CreatePolicySchema, updateBody: UpdatePolicyMetadataSchema, updateMethod: 'patch', hasDelete: false },
    { resource: 'vendors', label: 'vendor', entityName: 'Vendor', detailParam: 'vendorId', permission: 'vendors', listItem: VendorListItemDTOSchema, detail: VendorDetailDTOSchema, createBody: CreateVendorSchema, updateBody: UpdateVendorSchema, updateMethod: 'patch', hasDelete: false },
];

for (const cfg of ENTITIES) registerEntity(cfg);
