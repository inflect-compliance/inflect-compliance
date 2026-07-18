/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-B coverage — TestEvidenceRepository (previously ~0% branches).
 *
 * Fake `db` boundary. Branch focus on link()'s nullish-coalescing for every
 * optional field (provided value vs `?? null`), plus the where-shapes for
 * unlink() and listByRun().
 */

import { TestEvidenceRepository } from '@/app-layer/repositories/TestEvidenceRepository';
import { makeRequestContext } from '../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

function freshDb() {
    return {
        controlTestEvidenceLink: {
            create: jest.fn().mockResolvedValue({ id: 'l1' }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
        },
    };
}

let db: ReturnType<typeof freshDb>;

beforeEach(() => {
    jest.clearAllMocks();
    db = freshDb();
});

describe('link', () => {
    it('coalesces all optional fields to null when absent (null branch)', async () => {
        await TestEvidenceRepository.link(db as any, ctx, {
            testRunId: 'r1',
            kind: 'FILE',
        });
        const arg = db.controlTestEvidenceLink.create.mock.calls[0][0];
        expect(arg.data).toEqual({
            tenantId: 'tenant-1',
            testRunId: 'r1',
            kind: 'FILE',
            fileId: null,
            evidenceId: null,
            url: null,
            integrationResultId: null,
            note: null,
            // PR-R — evidence links carry a frozen integrity hash (null when absent).
            sha256Hash: null,
            createdByUserId: 'user-1',
        });
    });

    it('passes through provided optional fields (value branch)', async () => {
        await TestEvidenceRepository.link(db as any, ctx, {
            testRunId: 'r1',
            kind: 'FILE',
            fileId: 'f1',
            evidenceId: 'e1',
            url: 'https://x',
            integrationResultId: 'ir1',
            note: 'n',
            sha256Hash: 'deadbeef',
        });
        const arg = db.controlTestEvidenceLink.create.mock.calls[0][0];
        expect(arg.data).toMatchObject({
            kind: 'FILE',
            fileId: 'f1',
            evidenceId: 'e1',
            url: 'https://x',
            integrationResultId: 'ir1',
            note: 'n',
            sha256Hash: 'deadbeef',
        });
    });
});

describe('unlink', () => {
    it('deleteMany scoped by id + tenant', async () => {
        const res = await TestEvidenceRepository.unlink(db as any, ctx, 'l1');
        const arg = db.controlTestEvidenceLink.deleteMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'l1', tenantId: 'tenant-1' });
        expect(res).toEqual({ count: 1 });
    });
});

describe('listByRun', () => {
    it('filters by tenant + run, includes evidence/createdBy, orders desc', async () => {
        await TestEvidenceRepository.listByRun(db as any, ctx, 'r1');
        const arg = db.controlTestEvidenceLink.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ tenantId: 'tenant-1', testRunId: 'r1' });
        expect(arg.include.evidence.select).toEqual({ id: true, title: true, type: true });
        expect(arg.include.createdBy.select).toEqual({ id: true, name: true, email: true });
        expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });
});
