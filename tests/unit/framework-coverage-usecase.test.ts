/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/framework/coverage.ts`.
 *
 * Roadmap Q1 — Compliance core. Tests the framework coverage +
 * readiness-report layer that joins global framework requirements
 * (in the prisma global table) with tenant-scoped control→requirement
 * links.
 *
 * Covers:
 *   - computeCoverage — version-pinned lookup vs latest, notFound,
 *     mapped/unmapped split, bySection aggregation with section vs
 *     category fallback, controlMappings projection shape, zero-
 *     coverage safety.
 *   - listTemplates — frameworkKey filter (with notFound), category
 *     filter, search OR-shape, install-status enrichment, section
 *     filter applied post-fetch.
 *   - exportCoverageData — json passthrough vs CSV row + filename
 *     generation, double-quote escaping.
 *   - generateReadinessReport — deprecatedAt: null requirement
 *     filter, notApplicable controls, missingEvidence (NON
 *     NOT_APPLICABLE only), overdueTasks filtered to active
 *     WorkItemStatus, readinessScore math.
 *   - exportReadinessReport — JSON vs CSV shape with summary
 *     attached on CSV.
 */

const mockTenantDb = {
    controlRequirementLink: { findMany: jest.fn() },
    control: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockTenantDb)),
}));

jest.mock('@/lib/prisma', () => ({
    prisma: {
        framework: { findUnique: jest.fn(), findFirst: jest.fn() },
        frameworkRequirement: { findMany: jest.fn() },
        controlTemplate: { findMany: jest.fn() },
    },
}));

import { prisma } from '@/lib/prisma';
import {
    computeCoverage,
    listTemplates,
    exportCoverageData,
    generateReadinessReport,
    exportReadinessReport,
} from '@/app-layer/usecases/framework/coverage';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const readerCtx = makeRequestContext('READER');

// ─── computeCoverage ───────────────────────────────────────────────

describe('computeCoverage', () => {
    it('uses version-pinned lookup when version is supplied', async () => {
        (prisma.framework.findUnique as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([]);

        await computeCoverage(readerCtx, 'iso', '2022');

        expect(prisma.framework.findUnique).toHaveBeenCalledWith({
            where: { key_version: { key: 'iso', version: '2022' } },
        });
        expect(prisma.framework.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to findFirst when no version supplied', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([]);

        await computeCoverage(readerCtx, 'iso');

        expect(prisma.framework.findFirst).toHaveBeenCalled();
    });

    it('throws notFound when the framework does not exist', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(computeCoverage(readerCtx, 'nope')).rejects.toThrow(/Framework not found/i);
    });

    it('splits requirements into mapped/unmapped and computes coverage %', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1', code: 'A.5.1', title: 'X', section: 'A.5', category: null, sortOrder: 0 },
            { id: 'r-2', code: 'A.5.2', title: 'Y', section: 'A.5', category: null, sortOrder: 1 },
            { id: 'r-3', code: 'A.6.1', title: 'Z', section: 'A.6', category: null, sortOrder: 2 },
        ]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            { requirementId: 'r-1', control: { id: 'c-1', code: 'CTL-1', name: 'C1', status: 'IMPLEMENTED' }, requirement: { id: 'r-1', code: 'A.5.1', title: 'X' } },
            { requirementId: 'r-2', control: { id: 'c-2', code: 'CTL-2', name: 'C2', status: 'IN_PROGRESS' }, requirement: { id: 'r-2', code: 'A.5.2', title: 'Y' } },
        ]);

        const res = await computeCoverage(readerCtx, 'iso');

        expect(res.total).toBe(3);
        expect(res.mapped).toBe(2);
        expect(res.unmapped).toBe(1);
        expect(res.coveragePercent).toBe(67); // 2/3 rounded
        expect(res.unmappedRequirements).toEqual([
            { code: 'A.6.1', title: 'Z', section: 'A.6' },
        ]);
        expect(res.controlMappings).toHaveLength(2);
    });

    it('aggregates bySection with category fallback when section is null', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1', code: 'A.5.1', section: 'A.5', category: null },
            { id: 'r-2', code: 'A.5.2', section: null, category: 'TECH' }, // section null → falls to category
            { id: 'r-3', code: 'A.7.1', section: null, category: null },   // both null → 'Other'
        ]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([]);

        const res = await computeCoverage(readerCtx, 'iso');

        const labels = res.bySection.map((b: any) => b.section).sort();
        expect(labels).toEqual(['A.5', 'Other', 'TECH']);
    });

    it('returns 0 coverage when no requirements exist', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([]);

        const res = await computeCoverage(readerCtx, 'iso');

        expect(res.total).toBe(0);
        expect(res.coveragePercent).toBe(0);
    });
});

// ─── listTemplates ─────────────────────────────────────────────────

describe('listTemplates', () => {
    it('throws notFound when frameworkKey filter targets missing framework', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(listTemplates(readerCtx, { frameworkKey: 'nope' })).rejects.toThrow(/Framework not found/i);
    });

    it('applies category filter when supplied', async () => {
        (prisma.controlTemplate.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.control.findMany as jest.Mock).mockResolvedValue([]);

        await listTemplates(readerCtx, { category: 'TECH' });

        const args = (prisma.controlTemplate.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where.category).toBe('TECH');
    });

    it('applies search OR-shape (code + title)', async () => {
        (prisma.controlTemplate.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.control.findMany as jest.Mock).mockResolvedValue([]);

        await listTemplates(readerCtx, { search: 'backup' });

        const args = (prisma.controlTemplate.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where.OR).toEqual([
            { code: { contains: 'backup' } },
            { title: { contains: 'backup' } },
        ]);
    });

    it('flags installed=true for templates whose code matches an existing tenant control', async () => {
        (prisma.controlTemplate.findMany as jest.Mock).mockResolvedValue([
            { id: 't-1', code: 'A.5', title: 'X', description: '', category: '', defaultFrequency: null, isGlobal: true, tasks: [], requirementLinks: [], packLinks: [] },
            { id: 't-2', code: 'A.6', title: 'Y', description: '', category: '', defaultFrequency: null, isGlobal: true, tasks: [], requirementLinks: [], packLinks: [] },
        ]);
        (mockTenantDb.control.findMany as jest.Mock).mockResolvedValue([{ code: 'A.5' }]);

        const res = await listTemplates(readerCtx, {});

        expect(res[0].installed).toBe(true);
        expect(res[1].installed).toBe(false);
    });

    it('filters by section post-fetch (linked requirement section/category match)', async () => {
        (prisma.controlTemplate.findMany as jest.Mock).mockResolvedValue([
            { id: 't-1', code: 'A.5', title: 'X', description: '', category: '', defaultFrequency: null, isGlobal: true, tasks: [],
                requirementLinks: [{ requirement: { code: 'r1', title: 't1', section: 'A.5', category: null, framework: { key: 'iso', name: 'ISO' } } }],
                packLinks: [] },
            { id: 't-2', code: 'A.6', title: 'Y', description: '', category: '', defaultFrequency: null, isGlobal: true, tasks: [],
                requirementLinks: [{ requirement: { code: 'r2', title: 't2', section: 'A.6', category: null, framework: { key: 'iso', name: 'ISO' } } }],
                packLinks: [] },
        ]);
        (mockTenantDb.control.findMany as jest.Mock).mockResolvedValue([]);

        const res = await listTemplates(readerCtx, { section: 'A.5' });

        expect(res).toHaveLength(1);
        expect(res[0].code).toBe('A.5');
    });
});

// ─── exportCoverageData ────────────────────────────────────────────

describe('exportCoverageData', () => {
    beforeEach(() => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1', code: 'A.5.1', title: 'X', section: 'A.5', category: null, sortOrder: 0 },
        ]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            { requirementId: 'r-1', control: { id: 'c-1', code: 'CTL-1', name: 'C1', status: 'IMPLEMENTED' }, requirement: { id: 'r-1', code: 'A.5.1', title: 'X' } },
        ]);
    });

    it('returns the coverage payload unchanged in json mode', async () => {
        const res = await exportCoverageData(readerCtx, 'iso', 'json');
        expect((res as any).framework.key).toBe('iso');
        expect((res as any).controlMappings).toHaveLength(1);
    });

    it('returns CSV + filename in csv mode', async () => {
        const res = await exportCoverageData(readerCtx, 'iso', 'csv');
        expect((res as any).filename).toBe('iso-coverage.csv');
        expect((res as any).csv).toMatch(/^"Status","Requirement Code"/);
        expect((res as any).csv).toMatch(/"Mapped","A.5.1"/);
    });

    it('double-escapes embedded double quotes in CSV fields', async () => {
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            { requirementId: 'r-1', control: { id: 'c-1', code: 'CTL', name: 'has "quotes" in name', status: 'OK' }, requirement: { id: 'r-1', code: 'A', title: 'B' } },
        ]);
        const res = await exportCoverageData(readerCtx, 'iso', 'csv');
        expect((res as any).csv).toContain('"has ""quotes"" in name"');
    });
});

// ─── generateReadinessReport ───────────────────────────────────────

describe('generateReadinessReport', () => {
    it('filters to non-deprecated requirements only', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([]);

        await generateReadinessReport(readerCtx, 'iso');

        const args = (prisma.frameworkRequirement.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where.deprecatedAt).toBeNull();
    });

    it('computes notApplicable + missingEvidence + overdueTasks + readinessScore', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1', code: 'A.5.1', title: 'X', section: 'A.5', category: null, sortOrder: 0 },
            { id: 'r-2', code: 'A.5.2', title: 'Y', section: 'A.5', category: null, sortOrder: 1 },
        ]);
        const past = new Date(Date.now() - 86400000);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            {
                requirementId: 'r-1',
                control: {
                    id: 'c-1', code: 'CTL-1', name: 'NA Control', status: 'NOT_APPLICABLE', description: 'Cloud only',
                    tasks: [], evidence: [],
                },
            },
            {
                requirementId: 'r-2',
                control: {
                    id: 'c-2', code: 'CTL-2', name: 'Active', status: 'IMPLEMENTED', description: null,
                    tasks: [
                        { id: 't-1', status: 'OPEN', dueAt: past, title: 'Overdue task' },
                    ],
                    evidence: [], // missing — flagged
                },
            },
        ]);

        const res = await generateReadinessReport(readerCtx, 'iso');

        expect(res.notApplicableControls).toEqual([
            { code: 'CTL-1', name: 'NA Control', justification: 'Cloud only' },
        ]);
        expect(res.controlsMissingEvidence).toEqual([
            { code: 'CTL-2', name: 'Active', status: 'IMPLEMENTED' },
        ]);
        expect(res.overdueTasks).toHaveLength(1);
        expect(res.summary.missingEvidenceCount).toBe(1);
        expect(res.summary.overdueTaskCount).toBe(1);
        // readinessScore = max(0, coveragePercent - missingEvidence*2 - overdueTasks*3)
        // coveragePercent = round(2/2 * 100) = 100
        // → 100 - 2 - 3 = 95
        expect(res.summary.readinessScore).toBe(95);
    });

    it('uses "No justification provided" fallback for NOT_APPLICABLE without description', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1', code: 'A.5.1', title: 'X', section: 'A.5', category: null, sortOrder: 0 },
        ]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            {
                requirementId: 'r-1',
                control: { id: 'c-1', code: 'CTL-1', name: 'X', status: 'NOT_APPLICABLE', description: null, tasks: [], evidence: [] },
            },
        ]);

        const res = await generateReadinessReport(readerCtx, 'iso');
        expect(res.notApplicableControls[0].justification).toBe('No justification provided');
    });

    it('clamps readinessScore at 0 (cannot go negative)', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1', code: 'r1', title: 't1', section: '', category: null, sortOrder: 0 },
        ]);
        const past = new Date(Date.now() - 86400000);
        const overdueTasks = [];
        for (let i = 0; i < 50; i++) {
            overdueTasks.push({ id: `t-${i}`, status: 'OPEN', dueAt: past, title: `T${i}` });
        }
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            { requirementId: 'r-1', control: { id: 'c-1', code: 'CTL', name: 'X', status: 'IMPLEMENTED', description: '', tasks: overdueTasks, evidence: [] } },
        ]);

        const res = await generateReadinessReport(readerCtx, 'iso');
        expect(res.summary.readinessScore).toBe(0);
    });
});

// ─── exportReadinessReport ─────────────────────────────────────────

describe('exportReadinessReport', () => {
    beforeEach(() => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', name: 'ISO', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('returns the JSON report unchanged when format=json', async () => {
        const res = await exportReadinessReport(readerCtx, 'iso', 'json');
        expect((res as any).framework.key).toBe('iso');
    });

    it('returns CSV + filename + summary when format=csv', async () => {
        const res = await exportReadinessReport(readerCtx, 'iso', 'csv');
        expect((res as any).filename).toBe('iso-readiness-report.csv');
        expect((res as any).summary).toBeDefined();
        expect((res as any).csv).toMatch(/^"Section","Type"/);
    });
});
