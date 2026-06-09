/**
 * SP-F3 — Word (.docx) ↔ policy content conversion.
 *
 * Word documents are rich and IC's policy content (markdown/HTML) cannot
 * faithfully round-trip Word formatting. So Word-linked policies are
 * **SharePoint-authoritative**: IC PULLS them (DOCX → HTML via mammoth) and
 * stores the result as an HTML policy version, but does NOT push markdown bytes
 * back into a `.docx` (that would corrupt the document). Markdown-linked
 * policies stay fully bidirectional (SP-4).
 *
 * @module integrations/providers/sharepoint/docx
 */
import mammoth from 'mammoth';
import { sanitizeRichTextHtml } from '@/lib/security/sanitize';

/** True when the linked SharePoint item is a Word document. */
export function isDocxItem(name?: string, mimeType?: string): boolean {
    if (name && /\.docx$/i.test(name)) return true;
    if (mimeType && /officedocument\.wordprocessingml/i.test(mimeType)) return true;
    return false;
}

/**
 * Convert a .docx byte payload to sanitised HTML for an IC policy version.
 * Mammoth maps Word styles to semantic HTML; we then run it through the Epic-C
 * sanitiser (same allowlist as every other policy write path).
 */
export async function docxToPolicyHtml(bytes: ArrayBuffer | Buffer): Promise<string> {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const { value } = await mammoth.convertToHtml({ buffer });
    return sanitizeRichTextHtml(value ?? '');
}
