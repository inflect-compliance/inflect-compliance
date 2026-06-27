/**
 * Unit coverage for the framework-aware policy-template suggestion +
 * link usecases (src/app-layer/usecases/policy-template-mapping.ts).
 *
 * DB is mocked — these assert the resolution LOGIC: install-gating,
 * provenance → preChecked, grouping by framework/control, and the
 * idempotent explicit-link write path.
 */
import { buildRequestContext } from '../helpers/factories';

const mockDb = {
    framework: { findMany: jest.fn() },
    frameworkRequirement: { findMany: jest.fn() },
    controlRequirementLink: { findMany: jest.fn() },
    policy: { findFirst: jest.fn() },
    control: { findMany: jest.fn() },
    policyControlLink: { findMany: jest.fn(), createMany: jest.fn() },
};

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(mockDb)),
}));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));
jest.mock('@/app-layer/repositories/PolicyTemplateRepository', () => ({
    PolicyTemplateRepository: { getById: jest.fn() },
}));

import {
    getSuggestedControlLinks,
    linkPolicyControls,
    getInstalledMappedFrameworks,
    getTemplateExternalRef,
    getMappedFrameworkKeys,
} from '@/app-layer/usecases/policy-template-mapping';
import { PolicyTemplateRepository } from '@/app-layer/repositories/PolicyTemplateRepository';

const ctx = buildRequestContext({ role: 'ADMIN' }) as any;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('getSuggestedControlLinks', () => {
    it('returns empty when the template has no mapping', async () => {
        const res = await getSuggestedControlLinks(ctx, 'POL-99');
        expect(res.totalSuggested).toBe(0);
        expect(res.frameworks).toEqual([]);
        expect(mockDb.framework.findMany).not.toHaveBeenCalled();
    });

    it('only suggests frameworks the tenant has installed, with provenance → preChecked', async () => {
        // ISO 27001 installed; NIS2 NOT installed.
        mockDb.framework.findMany.mockResolvedValue([{ key: 'ISO27001', name: 'ISO 27001:2022' }]);
        // Mapped requirements (subset that has controls).
        mockDb.frameworkRequirement.findMany.mockResolvedValue([
            { id: 'r51', code: '5.1', title: 'Policies for information security', framework: { key: 'ISO27001' } },
            { id: 'r535', code: '5.35', title: 'Independent review', framework: { key: 'ISO27001' } },
        ]);
        // cA covers a from_toolkit req (5.1); cB covers only a curated req (5.35).
        mockDb.controlRequirementLink.findMany.mockResolvedValue([
            { requirementId: 'r51', control: { id: 'cA', name: 'Control A', code: 'C-A' } },
            { requirementId: 'r535', control: { id: 'cB', name: 'Control B', code: 'C-B' } },
        ]);

        const res = await getSuggestedControlLinks(ctx, 'POL-01');

        expect(res.frameworks).toHaveLength(1);
        expect(res.frameworks[0].frameworkKey).toBe('ISO27001');
        expect(res.frameworks[0].frameworkLabel).toBe('ISO 27001');
        expect(res.totalSuggested).toBe(2);

        const byId = Object.fromEntries(res.frameworks[0].suggestions.map((s) => [s.controlId, s]));
        // from_toolkit → pre-checked.
        expect(byId.cA.provenance).toBe('from_toolkit');
        expect(byId.cA.preChecked).toBe(true);
        // curated → unchecked.
        expect(byId.cB.provenance).toBe('curated');
        expect(byId.cB.preChecked).toBe(false);
        // No NIS2 group (not installed).
        expect(res.frameworks.find((f) => f.frameworkKey === 'NIS2')).toBeUndefined();
    });

    it('returns empty when no candidate framework is installed', async () => {
        mockDb.framework.findMany.mockResolvedValue([]);
        const res = await getSuggestedControlLinks(ctx, 'POL-01');
        expect(res.totalSuggested).toBe(0);
        expect(res.frameworks).toEqual([]);
        // Did not progress to requirement/control resolution.
        expect(mockDb.frameworkRequirement.findMany).not.toHaveBeenCalled();
    });

    it('a control covering both toolkit + curated reqs is marked from_toolkit', async () => {
        mockDb.framework.findMany.mockResolvedValue([{ key: 'ISO27001', name: 'ISO 27001:2022' }]);
        mockDb.frameworkRequirement.findMany.mockResolvedValue([
            { id: 'r51', code: '5.1', title: 'Policies', framework: { key: 'ISO27001' } },
            { id: 'r535', code: '5.35', title: 'Independent review', framework: { key: 'ISO27001' } },
        ]);
        mockDb.controlRequirementLink.findMany.mockResolvedValue([
            { requirementId: 'r51', control: { id: 'cX', name: 'Control X', code: 'C-X' } },
            { requirementId: 'r535', control: { id: 'cX', name: 'Control X', code: 'C-X' } },
        ]);
        const res = await getSuggestedControlLinks(ctx, 'POL-01');
        expect(res.totalSuggested).toBe(1);
        const s = res.frameworks[0].suggestions[0];
        expect(s.provenance).toBe('from_toolkit');
        expect(s.preChecked).toBe(true);
        expect(s.requirements.map((r) => r.code).sort()).toEqual(['5.1', '5.35']);
    });
});

describe('linkPolicyControls', () => {
    it('creates only fresh links (idempotent) and validates tenant ownership', async () => {
        mockDb.policy.findFirst.mockResolvedValue({ id: 'p1', title: 'Risk Policy' });
        // c1, c2 are tenant controls; c3 is foreign (not returned).
        mockDb.control.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
        // c1 already linked → only c2 is fresh.
        mockDb.policyControlLink.findMany.mockResolvedValue([{ controlId: 'c1' }]);
        mockDb.policyControlLink.createMany.mockResolvedValue({ count: 1 });

        const res = await linkPolicyControls(ctx, 'p1', ['c1', 'c2', 'c3']);

        expect(res.created).toBe(1);
        expect(res.linkedControlIds).toEqual(['c2']);
        expect(res.alreadyLinked).toEqual(['c1']);
        expect(mockDb.policyControlLink.createMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: [{ tenantId: ctx.tenantId, policyId: 'p1', controlId: 'c2' }],
                skipDuplicates: true,
            }),
        );
    });

    it('throws when the policy does not exist', async () => {
        mockDb.policy.findFirst.mockResolvedValue(null);
        await expect(linkPolicyControls(ctx, 'missing', ['c1'])).rejects.toThrow();
    });

    it('throws when no controlIds are supplied', async () => {
        await expect(linkPolicyControls(ctx, 'p1', [])).rejects.toThrow();
    });

    it('throws when none of the controls belong to the tenant', async () => {
        mockDb.policy.findFirst.mockResolvedValue({ id: 'p1', title: 'P' });
        mockDb.control.findMany.mockResolvedValue([]);
        await expect(linkPolicyControls(ctx, 'p1', ['foreign'])).rejects.toThrow();
        expect(mockDb.policyControlLink.createMany).not.toHaveBeenCalled();
    });
});

describe('getInstalledMappedFrameworks + helpers', () => {
    it('annotates only installed frameworks per template', async () => {
        mockDb.framework.findMany.mockResolvedValue([{ key: 'ISO27001' }]);
        const out = await getInstalledMappedFrameworks(ctx, ['POL-01', 'POL-99', null]);
        expect(out['POL-01']).toEqual(['ISO27001']); // NIS2 not installed → excluded
        expect(out['POL-99']).toBeUndefined();
    });

    it('getMappedFrameworkKeys reports both frameworks for a dual-mapped policy', () => {
        expect(getMappedFrameworkKeys('POL-01').sort()).toEqual(['ISO27001', 'NIS2']);
        expect(getMappedFrameworkKeys('POL-99')).toEqual([]);
        expect(getMappedFrameworkKeys(null)).toEqual([]);
    });

    it('getTemplateExternalRef resolves via the repository', async () => {
        (PolicyTemplateRepository.getById as jest.Mock).mockResolvedValue({ externalRef: 'POL-07' });
        expect(await getTemplateExternalRef(ctx, 'tmpl-id')).toBe('POL-07');
        (PolicyTemplateRepository.getById as jest.Mock).mockResolvedValue(null);
        expect(await getTemplateExternalRef(ctx, 'missing')).toBeNull();
    });
});
