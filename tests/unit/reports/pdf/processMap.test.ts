/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Branch-coverage unit tests for the Process Map PDF generator
 * (`src/app-layer/reports/pdf/processMap.ts`), previously ~0%.
 *
 * The generator runs the REAL PDFKit document + real cover/header
 * layout helpers (node-safe). Only the Prisma tenant lookup is
 * mocked. `doc.image()` is fed a genuine (tiny) PNG so the image
 * page renders for real.
 *
 * Branch classes exercised:
 *   • tenant lookup present → uses tenant.name.
 *   • tenant lookup null → tenantName falls back to "—".
 *   • watermark/subtitle defaults via the version field.
 */

const tenantFindUniqueMock = jest.fn();
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: { tenant: { findUnique: (...args: any[]) => tenantFindUniqueMock(...args) } },
}));

import zlib from 'zlib';
import { generateProcessMapPdf } from '@/app-layer/reports/pdf/processMap';
import { makeRequestContext } from '../../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

/** Drain a buffered PDFKit document into a Buffer for assertions. */
function drain(doc: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

/**
 * Build a minimal, valid 2x2 RGB PNG by hand so PDFKit's PNG
 * decoder accepts the bytes (a 1x1 image is enough but 2x2 keeps the
 * fit-scaling path non-degenerate). Avoids shipping a binary fixture.
 */
function makePng(): Buffer {
    const width = 2;
    const height = 2;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    function chunk(type: string, data: Buffer): Buffer {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcInput = Buffer.concat([typeBuf, data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
        return Buffer.concat([len, typeBuf, data, crc]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8); // bit depth
    ihdr.writeUInt8(2, 9); // colour type 2 = truecolour RGB
    ihdr.writeUInt8(0, 10); // compression
    ihdr.writeUInt8(0, 11); // filter
    ihdr.writeUInt8(0, 12); // interlace

    // Raw scanlines: each row prefixed with filter byte 0, then RGB triples.
    const rowBytes = 1 + width * 3;
    const raw = Buffer.alloc(rowBytes * height);
    for (let y = 0; y < height; y++) {
        raw[y * rowBytes] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const off = y * rowBytes + 1 + x * 3;
            raw[off] = 120;
            raw[off + 1] = 80;
            raw[off + 2] = 200;
        }
    }
    const idat = zlib.deflateSync(raw);

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// Standard CRC-32 used by the PNG spec.
const CRC_TABLE: number[] = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

const PNG = makePng();

beforeEach(() => {
    jest.clearAllMocks();
    tenantFindUniqueMock.mockResolvedValue({ name: 'Acme Corp' });
});

describe('generateProcessMapPdf', () => {
    it('renders a non-empty PDF with cover + image page (tenant present)', async () => {
        const doc = await generateProcessMapPdf(ctx, {
            mapName: 'Order Fulfilment',
            version: 5,
            pngBytes: PNG,
        });
        const buf = await drain(doc);
        expect(buf.slice(0, 4).toString()).toBe('%PDF');
        expect(buf.length).toBeGreaterThan(0);
        // Looks up the tenant by the ctx tenantId.
        expect(tenantFindUniqueMock).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: ctx.tenantId } }),
        );
    });

    it('falls back to "—" tenant name when the lookup returns null', async () => {
        tenantFindUniqueMock.mockResolvedValue(null);
        const doc = await generateProcessMapPdf(ctx, {
            mapName: 'Incident Response',
            version: 1,
            pngBytes: PNG,
        });
        const buf = await drain(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('handles a long map name + higher version (subtitle formatting)', async () => {
        const doc = await generateProcessMapPdf(ctx, {
            mapName: 'A'.repeat(120),
            version: 42,
            pngBytes: PNG,
        });
        const buf = await drain(doc);
        expect(buf.length).toBeGreaterThan(0);
    });
});
