/**
 * Audit Readiness PDF Generator
 *
 * Produces a branded ISO27001 SoA report with:
 *   Cover page → Metadata page → Summary metrics → Full SoA table → Readiness checks
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

export async function generateAuditReadinessPdf(
    ctx: RequestContext,
    options?: { framework?: string; watermark?: WatermarkMode },
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

    // ─── Content hash for auditability ───
    const dataHash = crypto.createHash('sha256')
        .update(JSON.stringify({ entries: soaReport.entries.length, summary: soaReport.summary, checks: checks.issues.length }))
        .digest('hex');

    // ─── Framework-derived labels (PR-H) ───
    // Every label derives from the RESOLVED framework, never an ISO literal.
    // "Annex A" / "Statement of Applicability" wording is gated behind the
    // ISO family — a SOC 2 / NIS2 report reads "Coverage & Readiness" /
    // "Requirements" so the auditor deliverable names its real framework.
    const isIso = soaReport.isIsoFamily;
    const fwName = soaReport.frameworkName;
    const reqCount = soaReport.summary.total;
    const applicabilitySection = isIso ? 'Statement of Applicability' : 'Coverage & Readiness';

    // ─── Meta ───
    const meta: ReportMeta = {
        tenantName: tenant?.name || 'Tenant',
        reportTitle: 'Audit Readiness Report',
        reportSubtitle: `${applicabilitySection} — ${fwName}`,
        generatedAt: new Date().toISOString(),
        framework: soaReport.framework,
        watermark: options?.watermark || 'NONE',
        contentHash: dataHash,
    };

    const dataSources: DataSourceNote[] = [
        {
            source: applicabilitySection,
            description: isIso
                ? `All ${reqCount} Annex A controls with mapping, applicability, and implementation status.`
                : `All ${reqCount} ${fwName} requirements with mapping and implementation status.`,
        },
        { source: 'Readiness Checks', description: 'Automated checks for unmapped requirements, missing justifications, and evidence gaps.' },
        { source: 'Control Evidence', description: 'Evidence counts and test results linked to applicable controls.' },
    ];

    // ─── Build PDF ───
    const doc = createPdfDocument(meta);

    // Cover
    addCoverPage(doc, meta);

    // Metadata page
    addMetadataPage(doc, meta, dataSources);

    // Content page
    doc.addPage();

    // Summary metrics
    addSectionTitle(doc, 'Summary');
    addSummaryMetrics(doc, [
        { label: 'Total Controls', value: soaReport.summary.total },
        { label: 'Applicable', value: soaReport.summary.applicable },
        { label: 'Not Applicable', value: soaReport.summary.notApplicable },
        { label: 'Unmapped', value: soaReport.summary.unmapped },
        { label: 'Implemented', value: soaReport.summary.implemented },
        { label: 'Missing Just.', value: soaReport.summary.missingJustification },
    ]);

    addSpacer(doc);

    // Readiness status
    addSectionTitle(doc, 'Readiness Status');
    if (checks.pass) {
        addParagraph(doc, '✓ SoA is audit-ready. All requirements are mapped and justified.');
    } else {
        addParagraph(doc, `✗ SoA is NOT audit-ready. ${checks.errorCount} error(s), ${checks.warningCount} warning(s) found.`);
    }

    addSpacer(doc);

    // SoA / requirements table
    addSectionTitle(doc, isIso ? 'Statement of Applicability' : 'Requirements');

    const widths = autoColumnWidths([1, 3, 1.2, 1.2, 1, 2]);
    const columns: TableColumn[] = [
        { key: 'code', header: 'Code', width: widths[0] },
        { key: 'title', header: 'Requirement', width: widths[1] },
        { key: 'applicable', header: 'Applicable', width: widths[2], align: 'center' },
        { key: 'status', header: 'Status', width: widths[3], align: 'center' },
        { key: 'controls', header: 'Controls', width: widths[4], align: 'center' },
        { key: 'justification', header: 'Justification', width: widths[5] },
    ];

    // Deterministic order: by requirement code
    const sortedEntries = [...soaReport.entries].sort((a, b) =>
        a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true })
    );

    const rows = sortedEntries.map(e => ({
        code: e.requirementCode,
        title: e.requirementTitle,
        applicable: e.applicable === true ? 'Yes' : e.applicable === false ? 'No' : 'Unmapped',
        status: e.implementationStatus ? e.implementationStatus.replace(/_/g, ' ') : '—',
        controls: String(e.mappedControls.length),
        justification: e.justification || '—',
    }));

    renderTable(doc, columns, rows, undefined, {
        values: {
            code: 'TOTAL',
            title: `${soaReport.summary.total} requirements`,
            applicable: `${soaReport.summary.applicable} yes`,
            status: `${soaReport.summary.implemented} impl.`,
            controls: '',
            justification: '',
        },
    });

    // Issues table (if any)
    if (checks.issues.length > 0) {
        addSpacer(doc, 24);
        addSectionTitle(doc, 'Readiness Issues');

        const issueWidths = autoColumnWidths([1, 1.5, 3, 3]);
        const issueColumns: TableColumn[] = [
            { key: 'severity', header: 'Severity', width: issueWidths[0], align: 'center' },
            { key: 'code', header: 'Requirement', width: issueWidths[1] },
            { key: 'reason', header: 'Issue', width: issueWidths[2] },
            { key: 'action', header: 'Suggested Action', width: issueWidths[3] },
        ];

        // Deterministic order: errors first, then by code
        const sortedIssues = [...checks.issues].sort((a, b) => {
            if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
            return a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true });
        });

        const issueRows = sortedIssues.map(i => ({
            severity: i.severity.toUpperCase(),
            code: i.requirementCode,
            reason: i.reason,
            action: i.suggestedAction,
        }));

        renderTable(doc, issueColumns, issueRows);
    }

    // Apply headers/footers/watermarks to all pages
    applyHeadersAndFooters(doc, meta);

    // NOTE: doc.end() is NOT called here — the route calls it after attaching listeners
    return doc;
}
