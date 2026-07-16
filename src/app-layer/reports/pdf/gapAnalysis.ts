/**
 * Gap Analysis PDF Generator
 *
 * Produces a branded gap analysis report with:
 *   Cover page → Metadata page → Summary → Issues grouped by severity
 */
import crypto from 'crypto';
import type { RequestContext } from '@/app-layer/types';
import { getSoA } from '@/app-layer/usecases/soa';
import { runSoAChecks } from '@/app-layer/usecases/soa-checks';
import { createPdfDocument } from '@/lib/pdf/pdfKitFactory';
import { addCoverPage, addMetadataPage, applyHeadersAndFooters } from '@/lib/pdf/layout';
import { renderTable, autoColumnWidths } from '@/lib/pdf/table';
import { addSectionTitle, addSummaryMetrics, addSpacer, addParagraph } from '@/lib/pdf/sections';
import type { ReportMeta, TableColumn, WatermarkMode, DataSourceNote } from '@/lib/pdf/types';
import prisma from '@/lib/prisma';

export async function generateGapAnalysisPdf(
    ctx: RequestContext,
    options?: { watermark?: WatermarkMode; framework?: string },
): Promise<PDFKit.PDFDocument> {
    // ─── Fetch data ───
    const soaReport = await getSoA(ctx, {
        framework: options?.framework,
        includeEvidence: true,
        includeTasks: true,
        includeTests: true,
    });
    const checks = runSoAChecks(soaReport.entries);

    const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true },
    });

    // ─── Content hash ───
    const dataHash = crypto.createHash('sha256')
        .update(JSON.stringify({ issues: checks.issues.length, pass: checks.pass }))
        .digest('hex');

    // ─── Framework-derived labels (PR-H) — never an ISO literal ───
    const isIso = soaReport.isIsoFamily;
    const fwName = soaReport.frameworkName;
    const requirementsPhrase = isIso ? `${fwName} Annex A requirements` : `${fwName} requirements`;

    // ─── Meta ───
    const meta: ReportMeta = {
        tenantName: tenant?.name || 'Tenant',
        reportTitle: 'Gap Analysis Report',
        reportSubtitle: `${fwName} — ${checks.issues.length} gaps identified`,
        generatedAt: new Date().toISOString(),
        framework: soaReport.framework,
        watermark: options?.watermark || 'NONE',
        contentHash: dataHash,
    };

    const dataSources: DataSourceNote[] = [
        { source: 'Readiness Checks', description: `Automated compliance gap detection against ${requirementsPhrase}.` },
        { source: 'Control Mappings', description: 'Requirement-to-control mappings and applicability statuses.' },
        { source: 'Evidence Coverage', description: 'Evidence attachment counts per applicable control.' },
    ];

    // ─── Build PDF ───
    const doc = createPdfDocument(meta);

    // Cover
    addCoverPage(doc, meta);

    // Metadata
    addMetadataPage(doc, meta, dataSources);

    // Content
    doc.addPage();

    // Summary
    addSectionTitle(doc, 'Analysis Summary');
    addSummaryMetrics(doc, [
        { label: 'Overall', value: checks.pass ? 'PASS' : 'FAIL' },
        { label: 'Errors', value: checks.errorCount },
        { label: 'Warnings', value: checks.warningCount },
        { label: 'Total Issues', value: checks.issues.length },
    ]);

    addSpacer(doc);

    if (checks.pass) {
        addParagraph(doc, `No critical gaps detected. The organization meets the minimum compliance requirements for ${requirementsPhrase}. Warnings below are for informational purposes.`);
    } else {
        addParagraph(doc, 'Critical gaps detected that must be resolved before audit. Errors represent non-compliance issues that require immediate action.');
    }

    addSpacer(doc);

    // Errors table
    const errors = checks.issues.filter(i => i.severity === 'error')
        .sort((a, b) => a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true }));
    if (errors.length > 0) {
        addSectionTitle(doc, `Errors (${errors.length})`);

        const errWidths = autoColumnWidths([1.2, 2, 3, 3]);
        const errColumns: TableColumn[] = [
            { key: 'code', header: 'Requirement', width: errWidths[0] },
            { key: 'rule', header: 'Rule', width: errWidths[1] },
            { key: 'reason', header: 'Issue', width: errWidths[2] },
            { key: 'action', header: 'Action Required', width: errWidths[3] },
        ];

        renderTable(doc, errColumns, errors.map(e => ({
            code: e.requirementCode,
            rule: e.rule.replace(/_/g, ' '),
            reason: e.reason,
            action: e.suggestedAction,
        })));
        addSpacer(doc);
    }

    // Warnings table
    const warnings = checks.issues.filter(i => i.severity === 'warning')
        .sort((a, b) => a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true }));
    if (warnings.length > 0) {
        addSectionTitle(doc, `Warnings (${warnings.length})`);

        const warnWidths = autoColumnWidths([1.2, 2, 3, 3]);
        const warnColumns: TableColumn[] = [
            { key: 'code', header: 'Requirement', width: warnWidths[0] },
            { key: 'rule', header: 'Rule', width: warnWidths[1] },
            { key: 'reason', header: 'Detail', width: warnWidths[2] },
            { key: 'action', header: 'Recommendation', width: warnWidths[3] },
        ];

        renderTable(doc, warnColumns, warnings.map(w => ({
            code: w.requirementCode,
            rule: w.rule.replace(/_/g, ' '),
            reason: w.reason,
            action: w.suggestedAction,
        })));
    }

    // No issues at all
    if (checks.issues.length === 0) {
        addSectionTitle(doc, 'No Gaps Found');
        addParagraph(doc, isIso
            ? 'All Annex A requirements are fully mapped, justified, and have associated evidence. The SoA is audit-ready.'
            : `All ${fwName} requirements are fully mapped and have associated evidence. Coverage is audit-ready.`);
    }

    // Apply headers/footers/watermarks
    applyHeadersAndFooters(doc, meta);

    return doc;
}
