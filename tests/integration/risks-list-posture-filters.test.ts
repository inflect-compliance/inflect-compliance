/**
 * Integration test for the PR-K register posture filters — `listRisks`
 * filtering by residual score range, treatment decision, and quantified
 * (has an ALE). Proves the server-side where-builder so the register can
 * slice by after-controls posture, not just inherent score.
 */

import * as dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import type { PrismaClient } from '@prisma/client';
import { createTenantWithDek } from '@/lib/security/tenant-key-manager';
import { listRisks } from '@/app-layer/usecases/risk';
import { getPermissionsForRole } from '@/lib/permissions';
import type { RequestContext } from '@/app-layer/types';

jest.setTimeout(30_000);
const describeFn = DB_AVAILABLE ? describe : describe.skip;

function ctxFor(tenantId: string, userId: string): RequestContext {
    return {
        requestId: `posture-${Date.now()}`,
        userId,
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

describeFn('listRisks — posture filters (PR-K)', () => {
    let prisma: PrismaClient;
    let tenantId = '';
    const ctx = () => ctxFor(tenantId, 'u-posture');
    const titleOf = async (filters: Parameters<typeof listRisks>[1]) =>
        (await listRisks(ctx(), filters)).map((r) => r.title).sort();

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();
        const t = await createTenantWithDek({ name: 'Posture', slug: `posture-${Date.now()}` });
        tenantId = t.id;
        await prisma.risk.createMany({
            data: [
                // Low residual, TREAT, quantified (fairAle).
                { tenantId, title: 'Reduced by controls', likelihood: 5, impact: 5, inherentScore: 25, score: 25, residualScore: 4, treatment: 'TREAT', fairAle: 12000 },
                // High residual, TOLERATE, quantified via SLE×ARO.
                { tenantId, title: 'Accepted high', likelihood: 5, impact: 4, inherentScore: 20, score: 20, residualScore: 20, treatment: 'TOLERATE', sleAmount: 5000, aroAmount: 2 },
                // Residual unassessed, AVOID, not quantified.
                { tenantId, title: 'Avoided unassessed', likelihood: 3, impact: 3, inherentScore: 9, score: 9, residualScore: null, treatment: 'AVOID' },
            ],
        });
    });

    afterAll(async () => {
        await prisma.risk.deleteMany({ where: { tenantId } }).catch(() => {});
    });

    it('filters by residual score range', async () => {
        expect(await titleOf({ residualScoreMax: 5 })).toEqual(['Reduced by controls']);
        expect(await titleOf({ residualScoreMin: 10 })).toEqual(['Accepted high']);
    });

    it('filters by treatment decision', async () => {
        expect(await titleOf({ treatment: 'TOLERATE' })).toEqual(['Accepted high']);
    });

    it('filters by quantified (has an ALE) either FAIR or SLE×ARO', async () => {
        expect(await titleOf({ quantified: 'yes' })).toEqual(['Accepted high', 'Reduced by controls']);
        expect(await titleOf({ quantified: 'no' })).toEqual(['Avoided unassessed']);
    });

    it('restricts to an explicit id set (stale detector plumbing)', async () => {
        const all = await listRisks(ctx(), {});
        const oneId = all[0].id;
        expect(await titleOf({ idIn: [oneId] })).toEqual([all[0].title]);
        expect(await titleOf({ idIn: [] })).toEqual([]);
    });
});
