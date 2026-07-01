/**
 * Vendor-document text extraction — the plumbing that turns a stored
 * VendorDocument file (usually a SOC 2 / ISO / pen-test PDF) into raw text
 * for the AI extractor. Kept separate from the AI + usecase layers so the
 * PDF dependency is isolated and swappable.
 */
import type { PrismaClient } from '@prisma/client';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { getProviderByName } from '@/lib/storage';
import type { StorageProviderType } from '@/lib/storage/types';

/** The subset of the client this service needs — accepts a tx client too. */
type FileReader = { fileRecord: Pick<PrismaClient['fileRecord'], 'findFirst'> };

/** Extract text from a PDF buffer. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
    const result = await pdfParse(buffer);
    return result.text ?? '';
}

/** Collect a readable stream into a Buffer. */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    }
    return Buffer.concat(chunks);
}

/**
 * Read the text of a stored file by its FileRecord id. Parses PDFs via
 * pdf-parse; returns other mime types' bytes as UTF-8 text (plain-text
 * reports). Returns null when the file can't be resolved.
 */
export async function getFileRecordText(
    db: FileReader,
    tenantId: string,
    fileId: string,
): Promise<string | null> {
    const file = await db.fileRecord.findFirst({
        where: { id: fileId, tenantId },
        select: { pathKey: true, mimeType: true, storageProvider: true },
    });
    if (!file) return null;
    const provider = getProviderByName((file.storageProvider ?? 'local') as StorageProviderType);
    const buffer = await streamToBuffer(provider.readStream(file.pathKey));
    if (file.mimeType === 'application/pdf' || file.pathKey.toLowerCase().endsWith('.pdf')) {
        return extractPdfText(buffer);
    }
    return buffer.toString('utf-8');
}
