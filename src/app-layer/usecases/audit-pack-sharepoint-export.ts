/**
 * SP-5 — export a frozen audit pack to SharePoint.
 *
 * Builds a ZIP ({README.md, pack.json manifest, items.csv}) and uploads it to a
 * chosen SharePoint library folder so auditors can access the pack in their
 * native environment. Records the export on the AuditPack + an
 * IntegrationExecution row (for the sync-health dashboard).
 *
 * Scope note: the ZIP carries the pack MANIFEST (reusing `exportAuditPack`),
 * not the raw evidence binaries — binary bundling is a documented follow-up.
 *
 * @module usecases/audit-pack-sharepoint-export
 */
import JSZip from 'jszip';
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { Prisma } from '@prisma/client';
import { badRequest, notFound } from '@/lib/errors/types';
import { assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { getAuditPack, exportAuditPack } from './audit-readiness/packs';
import {
    getSharePointClient,
    listSharePointConnections,
} from '../integrations/providers/sharepoint';

export interface SpExportDestination {
    connectionId?: string;
    driveId: string;
    /** Target folder item id, or 'root'. */
    folderId?: string;
    /** e.g. '{auditName}-{date}' → '<name>-2026-06-09'. */
    namingTemplate?: string;
}

function renderName(template: string, packName: string, isoDate: string): string {
    const safeName = packName.replace(/[^\w.-]+/g, '-');
    return template.replace('{auditName}', safeName).replace('{date}', isoDate).replace('{isoDate}', isoDate);
}

export async function exportAuditPackToSharePoint(
    ctx: RequestContext,
    packId: string,
    dest: SpExportDestination,
    deps: { fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<{ spItemId: string; webUrl: string }> {
    assertCanAdmin(ctx);
    if (!dest.driveId) throw badRequest('driveId is required');

    const pack = await getAuditPack(ctx, packId);
    if (pack.status !== 'FROZEN') throw badRequest('Only FROZEN packs can be exported to SharePoint');

    // Build the ZIP from the pack manifest (json + csv).
    const json = await exportAuditPack(ctx, packId, 'json');
    const csv = (await exportAuditPack(ctx, packId, 'csv')) as { csv: string };
    const now = deps.now ? deps.now() : new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const zip = new JSZip();
    zip.file(
        'README.md',
        `# ${pack.name}\n\nFrozen audit pack exported from Inflect.\n\n` +
            `- Status: ${pack.status}\n- Frozen: ${pack.frozenAt ?? 'n/a'}\n- Items: ${pack.items.length}\n- Exported: ${now.toISOString()}\n`,
    );
    zip.file('pack.json', JSON.stringify(json, null, 2));
    zip.file('items.csv', csv.csv);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const connectionId =
        dest.connectionId ?? (await listSharePointConnections(ctx))[0]?.id;
    if (!connectionId) throw notFound('No SharePoint connection configured');
    const client = await getSharePointClient(ctx, connectionId, deps);

    const fileName = `${renderName(dest.namingTemplate ?? '{auditName}-{isoDate}', pack.name, isoDate)}.zip`;
    const item = await client.uploadNewFile(
        dest.driveId,
        dest.folderId ?? 'root',
        fileName,
        bytes,
        'application/zip',
    );

    await runInTenantContext(ctx, async (db) => {
        await db.auditPack.update({
            where: { id: packId },
            data: { spExportItemId: item.id, spExportWebUrl: item.webUrl ?? null, spExportedAt: now },
        });
        await db.integrationExecution.create({
            data: {
                tenantId: ctx.tenantId,
                connectionId,
                provider: 'sharepoint',
                automationKey: 'sharepoint.audit_pack_export',
                status: 'PASSED',
                triggeredBy: 'manual',
                resultJson: { packId, fileName, spItemId: item.id } as Prisma.InputJsonValue,
                completedAt: now,
            },
        });
        await logEvent(db, ctx, {
            action: 'AUDIT_PACK_EXPORTED_SHAREPOINT',
            entityType: 'AuditPack',
            entityId: packId,
            details: `Exported audit pack to SharePoint (${fileName})`,
            detailsJson: { category: 'data_lifecycle', summary: 'Audit pack exported to SharePoint' },
        });
    });

    return { spItemId: item.id, webUrl: item.webUrl ?? '' };
}
