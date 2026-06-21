/**
 * @deprecated Evidence bundles were part of the old Issue model.
 * The IssueEvidenceBundle/IssueEvidenceBundleItem models have been removed.
 * This file provides stub implementations that throw descriptive errors.
 */
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { deprecatedResource } from '@/lib/errors/types';

export class EvidenceBundleRepository {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async listByIssue(_db: PrismaTx, _ctx: RequestContext, _issueId: string): Promise<any[]> {
        return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async getById(_db: PrismaTx, _ctx: RequestContext, _id: string): Promise<any | null> {
        return null;
    }

    // Return type is the structural contract the (now-dead) caller in
    // issue.ts::createBundle reads (`bundle.id`). The body only throws —
    // the shape is a compile-time contract, never a runtime value — so the
    // deprecated stub stays honest without an `any` return.
    static async create(_db: PrismaTx, _ctx: RequestContext, _issueId: string, _name: string): Promise<{ id: string }> {
        throw deprecatedResource('Evidence bundles are no longer supported on the Issue model. Use Task links instead.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async freeze(_db: PrismaTx, _ctx: RequestContext, _id: string): Promise<any | null> {
        throw deprecatedResource('Evidence bundles are no longer supported on the Issue model.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async addItem(_db: PrismaTx, _ctx: RequestContext, _bundleId: string, _data: { entityType: string; entityId: string; label?: string }): Promise<any | null> {
        throw deprecatedResource('Evidence bundles are no longer supported on the Issue model.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async listItems(_db: PrismaTx, _ctx: RequestContext, _bundleId: string): Promise<any[]> {
        return [];
    }
}
