/**
 * Public Trust Center read — the ONLY data path for the public /trust/<slug>
 * page.
 *
 * SECURITY CONTRACT (enforced by tests/guardrails/trust-center-coverage.test.ts):
 *   - This module imports NOTHING from the tenant-data layer
 *     (@/app-layer/usecases/* except trust-center, @/app-layer/repositories/*).
 *     The public page's entire reachable import graph must be free of
 *     Risk/Control/Evidence/Finding/etc. There is, by construction, no code
 *     path from the public page to any other tenant table.
 *   - It performs a SINGLE query against ONE table (`TrustCenter`), filtered to
 *     `enabled: true`, and `select`s ONLY the publishable fields — an explicit
 *     allowlist. tenantId, id, publishedByUserId, and every relation are never
 *     selected, so they cannot leak.
 *   - A disabled or non-existent slug returns `null` → the page renders 404
 *     (NOT 403 — we never disclose that a tenant exists).
 *
 * The query runs through the prisma singleton WITHOUT a tenant context: under
 * the table-owner role the `superuser_bypass` RLS policy applies, so the read
 * resolves the single curated row by its public slug. It is read-only.
 */
import { prisma } from '@/lib/prisma';

export interface PublishedFramework {
    key: string;
    statusLabel: string;
    badge?: string;
}

export interface PublishedDocument {
    label: string;
    url: string;
}

export interface PublicTrustCenter {
    slug: string;
    displayName: string;
    tagline: string | null;
    publishedFrameworks: PublishedFramework[];
    postureSummary: string | null;
    publishedDocuments: PublishedDocument[];
    securityContact: string | null;
    indexable: boolean;
    updatedAt: Date;
}

function asFrameworks(json: unknown): PublishedFramework[] {
    if (!Array.isArray(json)) return [];
    return json
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
        .map((f) => ({
            key: String(f.key ?? ''),
            statusLabel: String(f.statusLabel ?? ''),
            badge: f.badge != null ? String(f.badge) : undefined,
        }))
        .filter((f) => f.key && f.statusLabel);
}

function asDocuments(json: unknown): PublishedDocument[] {
    if (!Array.isArray(json)) return [];
    return json
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({ label: String(d.label ?? ''), url: String(d.url ?? '') }))
        .filter((d) => d.label && d.url);
}

/**
 * Resolve the public projection for an ENABLED trust center by slug.
 * Returns null for a missing OR disabled slug (→ 404, no existence disclosure).
 */
export async function getPublicTrustCenter(slug: string): Promise<PublicTrustCenter | null> {
    const row = await prisma.trustCenter.findFirst({
        where: { slug, enabled: true },
        // Explicit publishable-field allowlist. Adding a field here is the
        // ONLY way it reaches the public page — never select tenantId / id /
        // enabled / publishedByUserId / any relation.
        select: {
            slug: true,
            displayName: true,
            tagline: true,
            publishedFrameworks: true,
            postureSummary: true,
            publishedDocuments: true,
            securityContact: true,
            indexable: true,
            updatedAt: true,
        },
    });
    if (!row) return null;
    return {
        slug: row.slug,
        displayName: row.displayName,
        tagline: row.tagline,
        publishedFrameworks: asFrameworks(row.publishedFrameworks),
        postureSummary: row.postureSummary,
        publishedDocuments: asDocuments(row.publishedDocuments),
        securityContact: row.securityContact,
        indexable: row.indexable,
        updatedAt: row.updatedAt,
    };
}
