import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getSoA } from '@/app-layer/usecases/soa';
import { withApiErrorHandling } from '@/lib/errors/api';
import { logEvent } from '@/app-layer/events/audit';
import { runInTenantContext } from '@/lib/db-context';

/**
 * SoA CSV Export
 *
 * Columns (stable, documented):
 *   AnnexAKey | Title | Section | Applicable | Justification |
 *   ImplementationStatus | ControlRefs | Owner | Frequency |
 *   EvidenceCount | OpenTasks | LastTestResult
 *
 * No internal IDs are exposed — uses control codes and titles only.
 */

function escapeCSV(value: string | null | undefined): string {
    const s = String(value ?? '');
    // Wrap in quotes if contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);

    const report = await getSoA(ctx, {
        includeEvidence: true,
        includeTasks: true,
        includeTests: true,
    });

    // ─── Build CSV ───
    const headers = [
        'AnnexAKey',
        'Title',
        'Section',
        'Applicable',
        'Justification',
        'ImplementationStatus',
        'ControlRefs',
        'Owner',
        'Frequency',
        'EvidenceCount',
        'OpenTasks',
        'LastTestResult',
    ];

    const rows = report.entries.map(entry => {
        const controlRefs = entry.mappedControls
            .map(c => `${c.code || '—'} ${c.title}`)
            .join('; ');

        const owners = [...new Set(
            entry.mappedControls
                .map(c => c.owner)
                .filter(Boolean)
        )].join('; ');

        const frequencies = [...new Set(
            entry.mappedControls
                .map(c => c.frequency)
                .filter(Boolean)
        )].join('; ');

        const applicable = entry.applicable === true ? 'Yes'
            : entry.applicable === false ? 'No'
            : 'Unmapped';

        return [
            escapeCSV(entry.requirementCode),
            escapeCSV(entry.requirementTitle),
            escapeCSV(entry.section),
            escapeCSV(applicable),
            escapeCSV(entry.justification),
            escapeCSV(entry.implementationStatus?.replace(/_/g, ' ')),
            escapeCSV(controlRefs),
            escapeCSV(owners),
            escapeCSV(frequencies),
            String(entry.evidenceCount),
            String(entry.openTaskCount),
            escapeCSV(entry.lastTestResult),
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\r\n');

    // ─── Audit log ───
    await runInTenantContext(ctx, (db) =>
        logEvent(db, ctx, {
            action: 'SOA_EXPORTED',
            entityType: 'SoAReport',
            entityId: report.framework,
            details: `SoA exported as CSV (${report.entries.length} entries)`,
            metadata: { format: 'csv', entryCount: report.entries.length },
        })
    );

    // ─── Response ───
    const now = new Date().toISOString().slice(0, 10);
    const filename = `${ctx.tenantSlug || 'tenant'}_ISO27001_2022_SoA_${now}.csv`;

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-cache, no-store',
        },
    });
});
