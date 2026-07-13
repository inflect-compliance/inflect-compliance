/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Statement of Applicability (SoA) — Use Case Branch Coverage
 *
 * Pure unit test: the tenant-scoped `db` is mocked via `runInTenantContext`,
 * so no database is touched. Each test names the branch class it protects.
 *
 * Covers:
 *  - resolveInstalledFrameworkKey (no installs / ISO preferred / first key)
 *  - getSoA (framework pin vs resolve, notFound paths, applicability rollup
 *    arms, worst-status, justification collection, rollup includes, defaults)
 *  - the three rollup helpers (evidence / open-task / latest-test-result)
 */

const mockDbHolder: { db: any } = { db: null };

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(
        async (_ctx: any, fn: (db: any) => any) => fn(mockDbHolder.db),
    ),
}));

import { getSoA, resolveInstalledFrameworkKey } from '@/app-layer/usecases/soa';
import { makeRequestContext } from '../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

// ─── DB builder helpers ───

/** A control row matching the `select` shape in getSoA. */
function ctrl(over: Partial<any> = {}): any {
    return {
        id: over.id ?? 'c1',
        code: 'A.5.1',
        name: 'Control One',
        status: 'IMPLEMENTED',
        applicability: 'APPLICABLE',
        applicabilityJustification: null,
        ownerUserId: 'owner-1',
        frequency: 'ANNUAL',
        deletedAt: null,
        ...over,
    };
}

function link(requirementId: string, control: any): any {
    return { requirementId, control };
}

function req(over: Partial<any> = {}): any {
    return {
        id: over.id ?? 'r1',
        code: 'R-1',
        title: 'Requirement 1',
        section: 'Section A',
        category: null,
        sortOrder: 0,
        ...over,
    };
}

/**
 * Build a db whose finders return supplied fixtures. `findMany` is dispatched
 * by which model/method is invoked.
 */
function buildDb(opts: {
    installedFrameworks?: { key: string }[];
    framework?: any;
    requirements?: any[];
    links?: any[];
    tenant?: any;
    evidence?: any[];
    controlTasks?: any[];
    testRuns?: any[];
}): any {
    return {
        framework: {
            findMany: jest.fn().mockResolvedValue(opts.installedFrameworks ?? []),
            findFirst: jest.fn().mockResolvedValue(
                opts.framework === undefined ? null : opts.framework,
            ),
        },
        frameworkRequirement: {
            findMany: jest.fn().mockResolvedValue(opts.requirements ?? []),
        },
        controlRequirementLink: {
            findMany: jest.fn().mockResolvedValue(opts.links ?? []),
        },
        tenant: {
            findUnique: jest.fn().mockResolvedValue(
                opts.tenant === undefined ? { slug: 'acme' } : opts.tenant,
            ),
        },
        evidence: {
            groupBy: jest.fn().mockResolvedValue(opts.evidence ?? []),
        },
        // SoA open-task rollup now reads the unified Task model (not the
        // legacy controlTask) — the discoverable install paths write Task.
        task: {
            groupBy: jest.fn().mockResolvedValue(opts.controlTasks ?? []),
        },
        controlTestRun: {
            findMany: jest.fn().mockResolvedValue(opts.testRuns ?? []),
        },
    };
}

const FW = { id: 'fw-1', key: 'ISO27001', name: 'ISO 27001', version: '2022' };

beforeEach(() => {
    jest.clearAllMocks();
    mockDbHolder.db = buildDb({});
});

// ─── resolveInstalledFrameworkKey ───

describe('resolveInstalledFrameworkKey', () => {
    it('falls back to ISO27001 when nothing is installed', async () => {
        // Branch: installed.length === 0 → 'ISO27001'.
        mockDbHolder.db = buildDb({ installedFrameworks: [] });
        expect(await resolveInstalledFrameworkKey(ctx)).toBe('ISO27001');
    });

    it('prefers ISO27001 when it is among the installed frameworks', async () => {
        // Branch: keys.includes('ISO27001') === true.
        mockDbHolder.db = buildDb({
            installedFrameworks: [{ key: 'NIS2' }, { key: 'ISO27001' }],
        });
        expect(await resolveInstalledFrameworkKey(ctx)).toBe('ISO27001');
    });

    it('uses the first installed framework when ISO27001 is not installed', async () => {
        // Branch: keys.includes('ISO27001') === false → keys[0].
        mockDbHolder.db = buildDb({
            installedFrameworks: [{ key: 'NIS2' }, { key: 'SOC2' }],
        });
        expect(await resolveInstalledFrameworkKey(ctx)).toBe('NIS2');
    });
});

// ─── getSoA: guard / notFound branches ───

describe('getSoA — guards', () => {
    it('throws forbidden when the caller cannot read', async () => {
        // Branch: assertCanRead throws.
        const noRead = makeRequestContext('ADMIN', {
            permissions: {
                canRead: false,
                canWrite: false,
                canAdmin: false,
                canAudit: false,
                canExport: false,
            },
        });
        await expect(getSoA(noRead)).rejects.toThrow(/permission/i);
    });

    it('throws notFound when the framework does not exist', async () => {
        // Branch: !fw → throw notFound. Also exercises the resolve path
        // (options.framework absent → resolveInstalledFrameworkKey).
        mockDbHolder.db = buildDb({ installedFrameworks: [], framework: undefined });
        await expect(getSoA(ctx)).rejects.toThrow(/Framework "ISO27001" not found/);
    });

    it('throws notFound when the framework has no requirements', async () => {
        // Branch: requirements.length === 0 → throw. Pinned framework option.
        mockDbHolder.db = buildDb({ framework: FW, requirements: [] });
        await expect(getSoA(ctx, { framework: 'ISO27001' })).rejects.toThrow(
            /No requirements found/,
        );
    });
});

// ─── getSoA: applicability rollup arms ───

describe('getSoA — applicability derivation', () => {
    it('marks a requirement unmapped when no active controls link to it', async () => {
        // Branch: mappedControls.length === 0 → applicable=null, unmapped++.
        // Also: deletedAt filter removes the only link → effectively unmapped.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [link('r1', ctrl({ id: 'cdel', deletedAt: new Date() }))],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.summary.unmapped).toBe(1);
        expect(out.summary.applicable).toBe(0);
        expect(out.entries[0].applicable).toBeNull();
        expect(out.entries[0].mappedControls).toHaveLength(0);
    });

    it('marks applicable=true when at least one mapped control is APPLICABLE and rolls up worst status', async () => {
        // Branch: hasApplicable → applicable=true, applicable++.
        // worstStatus: mixed statuses sort → lowest (IN_PROGRESS) wins; not IMPLEMENTED.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [
                link('r1', ctrl({ id: 'c1', status: 'IMPLEMENTED', applicability: 'APPLICABLE' })),
                link('r1', ctrl({ id: 'c2', status: 'IN_PROGRESS', applicability: 'APPLICABLE' })),
                // NOT_APPLICABLE control is filtered out of the status rollup.
                link('r1', ctrl({ id: 'c3', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE' })),
            ],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.summary.applicable).toBe(1);
        expect(out.entries[0].applicable).toBe(true);
        expect(out.entries[0].implementationStatus).toBe('IN_PROGRESS');
        expect(out.summary.implemented).toBe(0);
    });

    it('counts a fully-IMPLEMENTED applicable requirement toward summary.implemented', async () => {
        // Branch: implementationStatus === 'IMPLEMENTED' → implemented++.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [link('r1', ctrl({ id: 'c1', status: 'IMPLEMENTED', applicability: 'APPLICABLE' }))],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.entries[0].implementationStatus).toBe('IMPLEMENTED');
        expect(out.summary.implemented).toBe(1);
    });

    it('returns null implementation status when applicable controls carry no rankable status', async () => {
        // Branch: worstStatus → applicable.length === 0 (unknown status) → null.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [link('r1', ctrl({ id: 'c1', status: 'BOGUS_STATUS', applicability: 'APPLICABLE' }))],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.entries[0].applicable).toBe(true);
        expect(out.entries[0].implementationStatus).toBeNull();
    });

    it('marks applicable=false with collected justifications when all controls are NOT_APPLICABLE', async () => {
        // Branch: !hasApplicable → applicable=false; justifications.length>0 → join.
        // missingCount === 0 → missingJustification NOT incremented.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [
                link('r1', ctrl({ id: 'c1', applicability: 'NOT_APPLICABLE', applicabilityJustification: 'Reason A' })),
                link('r1', ctrl({ id: 'c2', applicability: 'NOT_APPLICABLE', applicabilityJustification: 'Reason B' })),
            ],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.summary.notApplicable).toBe(1);
        expect(out.entries[0].applicable).toBe(false);
        expect(out.entries[0].justification).toBe('Reason A; Reason B');
        expect(out.summary.missingJustification).toBe(0);
        expect(out.entries[0].implementationStatus).toBeNull();
    });

    it('flags missingJustification and leaves justification null when NOT_APPLICABLE controls lack reasons', async () => {
        // Branch: justifications.length === 0 → justification stays null;
        // missingCount > 0 → missingJustification++.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [link('r1', ctrl({ id: 'c1', applicability: 'NOT_APPLICABLE', applicabilityJustification: null }))],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.entries[0].applicable).toBe(false);
        expect(out.entries[0].justification).toBeNull();
        expect(out.summary.missingJustification).toBe(1);
    });
});

// ─── getSoA: optional rollups + field defaults ───

describe('getSoA — rollups and field defaults', () => {
    it('loads evidence, task, and test rollups when requested and aggregates per entry', async () => {
        // Branch: includeEvidence/includeTasks/includeTests all true AND controlIds>0.
        // Helper branches: evidence row.controlId truthy; testRuns first-per-control;
        // entry rollup: evidenceCounts.get||0, taskCounts.get||0, tr && !lastTestResult.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [
                link('r1', ctrl({ id: 'c1', applicability: 'APPLICABLE', status: 'IMPLEMENTED' })),
                link('r1', ctrl({ id: 'c2', applicability: 'APPLICABLE', status: 'IMPLEMENTED' })),
            ],
            evidence: [
                { controlId: 'c1', _count: { id: 3 } },
                { controlId: null, _count: { id: 9 } }, // Branch: row.controlId falsy → skipped.
            ],
            controlTasks: [{ controlId: 'c2', _count: { id: 2 } }],
            testRuns: [
                { controlId: 'c1', result: 'PASS' },
                { controlId: 'c1', result: 'FAIL' }, // Branch: already has c1 → skipped.
            ],
        });
        const out = await getSoA(ctx, {
            framework: 'ISO27001',
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        });
        const e = out.entries[0];
        expect(e.evidenceCount).toBe(3); // c1=3, c2=0
        expect(e.openTaskCount).toBe(2); // c2=2, c1=0
        expect(e.lastTestResult).toBe('PASS'); // first c1 run wins
    });

    it('skips rollup loaders when their include flags are off (zeroed counts)', async () => {
        // Branch: include flags false → loaders never invoked; counts default 0/null.
        const db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [link('r1', ctrl({ id: 'c1', applicability: 'APPLICABLE' }))],
        });
        mockDbHolder.db = db;
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(db.evidence.groupBy).not.toHaveBeenCalled();
        expect(db.task.groupBy).not.toHaveBeenCalled();
        expect(db.controlTestRun.findMany).not.toHaveBeenCalled();
        expect(out.entries[0].evidenceCount).toBe(0);
        expect(out.entries[0].openTaskCount).toBe(0);
        expect(out.entries[0].lastTestResult).toBeNull();
    });

    it('skips rollup loaders when include flags are on but there are no active controls', async () => {
        // Branch: includeX true but controlIds.length === 0 → loaders not called.
        const db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [], // no controls
        });
        mockDbHolder.db = db;
        await getSoA(ctx, {
            framework: 'ISO27001',
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        });
        expect(db.evidence.groupBy).not.toHaveBeenCalled();
        expect(db.task.groupBy).not.toHaveBeenCalled();
        expect(db.controlTestRun.findMany).not.toHaveBeenCalled();
    });

    it('falls back to category then null for section, empty string for title, and empty slug', async () => {
        // Branch: req.section falsy → req.category; both falsy → null.
        //         req.title falsy → ''. tenant?.slug falsy → ''.
        mockDbHolder.db = buildDb({
            framework: { ...FW, version: null }, // Branch: fw.version falsy → fw.name only.
            requirements: [
                req({ id: 'r1', section: null, category: 'CatX', title: 'T1' }),
                req({ id: 'r2', section: null, category: null, title: null }),
            ],
            links: [],
            tenant: null, // Branch: tenant?.slug || ''.
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.entries[0].section).toBe('CatX');
        expect(out.entries[1].section).toBeNull();
        expect(out.entries[1].requirementTitle).toBe('');
        expect(out.tenantSlug).toBe('');
        expect(out.frameworkName).toBe('ISO 27001'); // no version suffix
    });

    it('builds frameworkName with version suffix when fw.version is present', async () => {
        // Branch: fw.version truthy → `${name}:${version}`.
        mockDbHolder.db = buildDb({
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [link('r1', ctrl({ id: 'c1', applicability: 'APPLICABLE' }))],
        });
        const out = await getSoA(ctx, { framework: 'ISO27001' });
        expect(out.frameworkName).toBe('ISO 27001:2022');
        expect(out.framework).toBe('ISO27001');
        expect(out.tenantId).toBe('tenant-1');
        expect(out.summary.total).toBe(1);
        expect(typeof out.generatedAt).toBe('string');
    });

    it('resolves the framework via resolveInstalledFrameworkKey when no framework option is given', async () => {
        // Branch: options.framework falsy → await resolveInstalledFrameworkKey.
        mockDbHolder.db = buildDb({
            installedFrameworks: [{ key: 'ISO27001' }],
            framework: FW,
            requirements: [req({ id: 'r1' })],
            links: [],
        });
        const out = await getSoA(ctx);
        expect(out.framework).toBe('ISO27001');
        expect(mockDbHolder.db.framework.findMany).toHaveBeenCalled();
    });
});
