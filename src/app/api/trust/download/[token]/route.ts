import { NextRequest, NextResponse } from 'next/server';
import { consumeDownloadToken } from '@/lib/trust-center/gated';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storage';

/** PR-8 — PUBLIC: download a gated document via a single-use, expiring token. */
export const GET = withApiErrorHandling(async (_req: NextRequest, { params: p }: { params: Promise<{ token: string }> }) => {
    const { token } = await p;
    const resolved = await consumeDownloadToken(token);
    if (!resolved) return jsonResponse({ error: 'invalid_or_expired' }, { status: 404 });
    const file = await prisma.fileRecord.findUnique({ where: { id: resolved.fileRecordId }, select: { pathKey: true, originalName: true } });
    if (!file) return jsonResponse({ error: 'not_found' }, { status: 404 });
    const url = await getStorageProvider().createSignedDownloadUrl(file.pathKey, { downloadFilename: file.originalName });
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
});
