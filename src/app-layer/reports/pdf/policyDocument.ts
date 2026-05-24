/**
 * Policy Document PDF Generator (B9).
 *
 * Produces a publication-quality export of a single policy:
 *
 *   • A branded cover page with a "logo" wordmark, the policy
 *     title, category, classification chip, and the provenance
 *     row (version + effective date + next review + owner).
 *   • A clickable Table of Contents — each row links to the
 *     matching section via PDFKit's `addNamedDestination` + `link.goTo`.
 *   • Body sections rendered with explicit page breaks so a long
 *     Purpose section never bleeds into Scope mid-paragraph.
 *   • The shared `applyHeadersAndFooters` stamping pass for the
 *     per-page chrome (tenant name, title, date, page counter,
 *     classification suffix).
 *
 * The policy's content (Markdown-ish text stored in
 * `PolicyVersion.contentText`) is parsed into sections by `#` /
 * `##` heading markers. Sections without an explicit `# Heading`
 * are folded into a single "Policy" section so a freshly-created
 * policy still exports cleanly.
 */
import crypto from 'crypto';
import { runInTenantContext } from '@/lib/db-context';
import type { RequestContext } from '@/app-layer/types';
import { assertCanRead } from '@/app-layer/policies/common';
import { notFound } from '@/lib/errors/types';
import { PolicyRepository } from '@/app-layer/repositories/PolicyRepository';
import { createPdfDocument } from '@/lib/pdf/pdfKitFactory';
import { applyHeadersAndFooters } from '@/lib/pdf/layout';
import {
    addPolicyCoverPage,
    addPolicyToc,
    addPolicySectionTitle,
    addPolicyBodyParagraph,
    CLASSIFICATION_LABEL,
    type PolicyClassification,
    type PolicyPdfMeta,
    type PolicyTocEntry,
} from '@/lib/pdf/policyLayout';
import type { ReportMeta } from '@/lib/pdf/types';
import prisma from '@/lib/prisma';

interface PolicyPdfOptions {
    /**
     * The handling classification — drives the cover chip + per-page
     * footer suffix. Default `INTERNAL` (the safest default for an
     * organisation-internal policy document).
     */
    classification?: PolicyClassification;
}

interface ParsedSection {
    title: string;
    body: string;
}

/**
 * Parse the policy's Markdown-ish body into ordered sections. A
 * line starting with `# ` opens a new top-level section. Lines
 * starting with `## ` are folded into the current section as
 * subsection prose (they aren't section breaks — that would push
 * the TOC too deep for a one-page policy export).
 *
 * If the body has no top-level heading at all, returns a single
 * "Policy" section carrying the whole body.
 */
function parseSections(content: string): ParsedSection[] {
    const lines = content.split(/\r?\n/);
    const sections: ParsedSection[] = [];
    let current: ParsedSection | null = null;

    for (const raw of lines) {
        const m = /^#\s+(.+)$/.exec(raw);
        if (m) {
            if (current) sections.push(current);
            current = { title: m[1].trim(), body: '' };
            continue;
        }
        if (current) {
            current.body += (current.body ? '\n' : '') + raw;
        } else {
            // Pre-heading prose — open an implicit section.
            current = { title: 'Policy', body: raw };
        }
    }
    if (current) sections.push(current);

    // Trim trailing blank lines per-section.
    for (const s of sections) {
        s.body = s.body.replace(/\n+$/g, '').trim();
    }

    if (sections.length === 0) {
        return [{ title: 'Policy', body: '' }];
    }
    return sections;
}

export async function generatePolicyDocumentPdf(
    ctx: RequestContext,
    policyId: string,
    options?: PolicyPdfOptions,
): Promise<PDFKit.PDFDocument> {
    assertCanRead(ctx);

    const policy = await runInTenantContext(ctx, async (db) => {
        const p = await PolicyRepository.getById(db, ctx, policyId);
        if (!p) throw notFound('Policy not found');
        return p;
    });

    const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true },
    });

    const classification: PolicyClassification =
        options?.classification ?? 'INTERNAL';

    const currentVersion = policy.currentVersion;
    const versionNumber = currentVersion?.versionNumber ?? policy.lifecycleVersion ?? 1;
    const content = currentVersion?.contentText ?? '';
    const sections = parseSections(content);

    const policyMeta: PolicyPdfMeta = {
        tenantName: tenant?.name || 'Tenant',
        policyTitle: policy.title,
        category: policy.category,
        versionNumber,
        effectiveAt:
            currentVersion?.createdAt instanceof Date
                ? currentVersion.createdAt.toISOString()
                : null,
        nextReviewAt:
            policy.nextReviewAt instanceof Date
                ? policy.nextReviewAt.toISOString()
                : null,
        ownerName: policy.owner?.name ?? null,
        classification,
        generatedAt: new Date().toISOString(),
    };

    // `ReportMeta` (shared chrome) carries a smaller surface — feed
    // the same fields so the per-page header/footer aligns with the
    // cover page. The classification rides on the watermark slot
    // intentionally (the watermark is the per-page corner stamp;
    // for a policy, "INTERNAL" / "CONFIDENTIAL" IS the handling
    // banner we want stamped).
    const dataHash = crypto
        .createHash('sha256')
        .update(
            JSON.stringify({
                policyId: policy.id,
                version: versionNumber,
                contentLen: content.length,
            }),
        )
        .digest('hex');

    const meta: ReportMeta = {
        tenantName: policyMeta.tenantName,
        reportTitle: policy.title,
        reportSubtitle: policy.category || undefined,
        generatedAt: policyMeta.generatedAt,
        watermark:
            classification === 'CONFIDENTIAL' || classification === 'RESTRICTED'
                ? 'DRAFT' // dual-purpose — paints the watermark band
                : 'NONE',
        contentHash: dataHash,
    };

    const doc = createPdfDocument(meta);

    // ─── Cover ───
    addPolicyCoverPage(doc, policyMeta);

    // ─── TOC ───
    const toc: PolicyTocEntry[] = sections.map((s, i) => ({
        title: s.title,
        destName: `policy-section-${i}`,
    }));
    addPolicyToc(doc, toc);

    // ─── Body sections ───
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        // First section: we're already on a fresh page from the TOC
        // pagebreak. Subsequent sections force their own page so
        // the section boundary reads as a section boundary, not a
        // continuation.
        if (i > 0) doc.addPage();

        addPolicySectionTitle(doc, section.title, toc[i].destName);

        // Paragraphs split on blank lines.
        const paragraphs = section.body
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean);
        if (paragraphs.length === 0) {
            addPolicyBodyParagraph(doc, '— (no content) —');
        } else {
            for (const para of paragraphs) {
                // Replace `##` sub-headings with bold-looking prose
                // (the TOC keeps a single layer; sub-headings stay
                // visible in the body).
                const cleaned = para
                    .replace(/^##\s+/, '')
                    .replace(/^-\s+/gm, '• ');
                addPolicyBodyParagraph(doc, cleaned);
            }
        }
    }

    // Per-page chrome — header + footer + (optional) watermark
    // stamped on every buffered page except the cover.
    applyHeadersAndFooters(doc, {
        ...meta,
        // Encode the classification into the page footer suffix
        // by overriding the title slot — this keeps the existing
        // header layout (left=tenant, center=title, right=date)
        // without needing a new stamping pass.
        reportTitle: `${policy.title} · ${CLASSIFICATION_LABEL[classification].toUpperCase()}`,
    });

    return doc;
}
