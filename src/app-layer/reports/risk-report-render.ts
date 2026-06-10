/**
 * RQ-10 — report renderers (CSV + PDF). PPTX is a documented follow-up
 * (no pptxgenjs dependency yet).
 *
 * `renderCsv` is pure (deterministic Buffer from the assembled data);
 * `renderPdf` reuses the branded `src/lib/pdf` pipeline.
 *
 * @module reports/risk-report-render
 */
import { createPdfDocument } from '@/lib/pdf/pdfKitFactory';
import { addCoverPage, applyHeadersAndFooters } from '@/lib/pdf/layout';
import { addSectionTitle, addSummaryMetrics } from '@/lib/pdf/sections';
import { renderTable, autoColumnWidths } from '@/lib/pdf/table';

export interface ReportData {
    title: string;
    tenantName: string;
    generatedAt: string;
    totals: { totalRiskCount: number; quantifiedCount: number; totalAle: number; avgAle: number | null; maxAle: number | null };
    var: { mean: number | null; p95: number | null; p99: number | null } | null;
    appetite: { status: string; portfolioAle: number } | null;
    topRisks: Array<{ title: string; category: string | null; ale: number }>;
    bia: { withRto: number; withRpo: number; totalRevenueAtRisk: number };
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
const csvCell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export — portfolio KPIs + top risks. Deterministic. */
export function renderCsv(data: ReportData): Buffer {
    const lines: string[] = [];
    lines.push(`Report,${csvCell(data.title)}`);
    lines.push(`Generated,${csvCell(data.generatedAt)}`);
    lines.push('');
    lines.push('Metric,Value');
    lines.push(`Total risks,${data.totals.totalRiskCount}`);
    lines.push(`Quantified risks,${data.totals.quantifiedCount}`);
    lines.push(`Total ALE,${Math.round(data.totals.totalAle)}`);
    lines.push(`Average ALE,${data.totals.avgAle == null ? '' : Math.round(data.totals.avgAle)}`);
    lines.push(`Max single ALE,${data.totals.maxAle == null ? '' : Math.round(data.totals.maxAle)}`);
    if (data.var) {
        lines.push(`Mean ALE (Monte Carlo),${data.var.mean == null ? '' : Math.round(data.var.mean)}`);
        lines.push(`VaR-95,${data.var.p95 == null ? '' : Math.round(data.var.p95)}`);
        lines.push(`VaR-99,${data.var.p99 == null ? '' : Math.round(data.var.p99)}`);
    }
    if (data.appetite) lines.push(`Appetite status,${csvCell(data.appetite.status)}`);
    lines.push(`BIA: risks with RTO,${data.bia.withRto}`);
    lines.push(`BIA: total revenue at risk,${Math.round(data.bia.totalRevenueAtRisk)}`);
    lines.push('');
    lines.push('Top risks by ALE');
    lines.push('Risk,Category,ALE');
    for (const r of data.topRisks) lines.push([csvCell(r.title), csvCell(r.category), Math.round(r.ale)].join(','));
    return Buffer.from(lines.join('\n'), 'utf8');
}

/** PDF export — branded cover + KPI summary + top-risks table. */
export async function renderPdf(data: ReportData): Promise<Buffer> {
    const meta = { tenantName: data.tenantName, reportTitle: data.title, reportSubtitle: 'Risk quantification report', generatedAt: data.generatedAt };
    const doc = createPdfDocument(meta);
    addCoverPage(doc, meta);
    doc.addPage();

    addSectionTitle(doc, 'Portfolio summary');
    addSummaryMetrics(doc, [
        { label: 'Total risks', value: data.totals.totalRiskCount },
        { label: 'Quantified', value: data.totals.quantifiedCount },
        { label: 'Total ALE', value: money(data.totals.totalAle) },
        ...(data.var ? [{ label: 'VaR-95', value: money(data.var.p95) }] : []),
        ...(data.appetite ? [{ label: 'Appetite', value: data.appetite.status }] : []),
    ]);

    addSectionTitle(doc, 'Top risks by ALE');
    const widths = autoColumnWidths([3, 2, 2]);
    const columns = [
        { key: 'title', header: 'Risk', width: widths[0] },
        { key: 'category', header: 'Category', width: widths[1] },
        { key: 'ale', header: 'ALE', width: widths[2], align: 'right' as const },
    ];
    const rows = data.topRisks.map((r) => ({ title: r.title, category: r.category ?? '—', ale: money(r.ale) }));
    renderTable(doc, columns, rows);

    applyHeadersAndFooters(doc, meta);
    return docToBuffer(doc);
}

/** Collect a finalized PDFKit document into a Buffer. */
function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}
