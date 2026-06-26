/**
 * Policy content enrichment — isomorphic, dependency-free string helpers
 * shared by the on-screen policy view and (later) the PDF export.
 *
 * Two structural features layer on top of the stored HTML policy body
 * WITHOUT changing what's persisted:
 *
 *   - **Heading anchors** — every `<h1>`–`<h3>` gets a stable, unique
 *     slug `id` so the table of contents can link to it.
 *   - **Auto Table of Contents** — a `Contents` nav built from the
 *     document headings, inserted after the first page break (`<hr>`)
 *     if present, else after the first heading. The document title
 *     (a leading `<h1>`) is excluded from the list.
 *
 * Page breaks themselves are plain `<hr>` elements (authored via the
 * editor's "Page break" button); they're styled as a labelled divider
 * on screen and become real page breaks in print / PDF.
 *
 * The enrichment runs on ALREADY-SANITISED HTML and only emits markup
 * derived from the document's own (escaped) heading text + slug ids, so
 * it introduces no new injection surface.
 */

export interface PolicyHeading {
    level: number;
    text: string;
    id: string;
}

/** Strip tags/entities and collapse whitespace to plain text. */
function toPlainText(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Minimal HTML-escape for text we re-emit inside generated markup. */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** URL-safe slug from heading text. Falls back to `section`. */
export function slugifyHeading(text: string): string {
    const base = toPlainText(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/g, '');
    return base || 'section';
}

/**
 * Assign a stable, unique `id` to every h1–h3 (preserving any author-set
 * id) and return the heading list in document order.
 */
export function assignHeadingIds(html: string): { html: string; headings: PolicyHeading[] } {
    const seen = new Set<string>();
    const headings: PolicyHeading[] = [];

    const out = html.replace(
        /<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>/gi,
        (match, lvlRaw: string, attrs: string, inner: string) => {
            const text = toPlainText(inner);
            if (!text) return match; // empty heading — leave untouched, no anchor
            const level = Number(lvlRaw);

            const existing = /\bid=["']([^"']+)["']/i.exec(attrs)?.[1];
            let id = existing && !seen.has(existing) ? existing : '';
            if (!id) {
                const slug = slugifyHeading(text);
                let candidate = slug;
                let n = 2;
                while (seen.has(candidate)) candidate = `${slug}-${n++}`;
                id = candidate;
            }
            seen.add(id);
            headings.push({ level, text, id });

            const attrsWithId = /\bid=/i.test(attrs)
                ? attrs.replace(/\bid=["'][^"']*["']/i, `id="${id}"`)
                : `${attrs} id="${id}"`;
            return `<h${lvlRaw}${attrsWithId}>${inner}</h${lvlRaw}>`;
        },
    );

    return { html: out, headings };
}

/** Build the Contents nav markup from a heading list. */
function buildTocHtml(headings: PolicyHeading[]): string {
    const items = headings
        .map(
            (h) =>
                `<li class="policy-toc-l${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
        )
        .join('');
    return (
        `<nav class="policy-toc" aria-label="Table of contents" data-testid="policy-toc">` +
        `<p class="policy-toc-title">Contents</p>` +
        `<ul>${items}</ul>` +
        `</nav>`
    );
}

/**
 * Enrich a sanitised HTML policy body with heading anchors + an
 * auto-generated Table of Contents. Returns the HTML unchanged when
 * there aren't at least two linkable sections (a TOC would be noise).
 *
 * Placement, matching the reference layout (Title → page break →
 * Contents): the TOC is inserted immediately after the first `<hr>`
 * page break when present, otherwise right after the first heading,
 * otherwise prepended.
 */
export function enrichPolicyHtml(html: string | null | undefined): string {
    if (!html) return html ?? '';
    const { html: withIds, headings } = assignHeadingIds(html);

    // Exclude a leading <h1> — that's the document title, not a section.
    const eligible = headings[0]?.level === 1 ? headings.slice(1) : headings;
    if (eligible.length < 2) return withIds;

    const toc = buildTocHtml(eligible);

    const hr = /<hr\b[^>]*>/i.exec(withIds);
    if (hr) {
        const at = hr.index + hr[0].length;
        return withIds.slice(0, at) + toc + withIds.slice(at);
    }
    const firstHeading = /<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/i.exec(withIds);
    if (firstHeading) {
        const at = firstHeading.index + firstHeading[0].length;
        return withIds.slice(0, at) + toc + withIds.slice(at);
    }
    return toc + withIds;
}

/** Heading list (post-id-assignment) — used by exporters. */
export function extractPolicyHeadings(html: string | null | undefined): PolicyHeading[] {
    if (!html) return [];
    return assignHeadingIds(html).headings;
}
