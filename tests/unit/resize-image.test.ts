/** @jest-environment jsdom */
/**
 * Coverage for the first-party client-side image resizer.
 *
 * jsdom ships no real canvas backend (`getContext('2d')` returns
 * `null` and `toDataURL` throws), and its `Image` never fires
 * `onload` for a synthetic `src`. So the happy path is driven by
 * stubbing `Image`, `HTMLCanvasElement.prototype.getContext`, and
 * `HTMLCanvasElement.prototype.toDataURL`. The real jsdom
 * `FileReader` is used for the success path; a mock replaces it for
 * the reader-error branch.
 */
import { resizeImage } from '@/lib/resize-image';

const FAKE_DATA_URL = 'data:image/jpeg;base64,AAAA';

class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width: number;
    height: number;
    private _src = '';
    static mode: 'load' | 'error' = 'load';
    static nextW = 800;
    static nextH = 600;

    constructor() {
        this.width = MockImage.nextW;
        this.height = MockImage.nextH;
    }

    set src(value: string) {
        this._src = value;
        // Fire asynchronously like a real Image decode.
        queueMicrotask(() => {
            if (MockImage.mode === 'error') this.onerror?.();
            else this.onload?.();
        });
    }
    get src() {
        return this._src;
    }
}

const drawImage = jest.fn();
let getContextSpy: jest.SpyInstance;
let toDataURLSpy: jest.SpyInstance;
let getContextReturn: unknown = null;

const OriginalImage = global.Image;

beforeEach(() => {
    jest.clearAllMocks();
    MockImage.mode = 'load';
    MockImage.nextW = 800;
    MockImage.nextH = 600;
    // @ts-expect-error — swap in the controllable Image stub.
    global.Image = MockImage;

    getContextReturn = {
        imageSmoothingQuality: 'low',
        drawImage,
    };
    getContextSpy = jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        // @ts-expect-error — fake 2D context shape is enough for the code path.
        .mockImplementation(() => getContextReturn);
    toDataURLSpy = jest
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockReturnValue(FAKE_DATA_URL);
});

afterEach(() => {
    getContextSpy.mockRestore();
    toDataURLSpy.mockRestore();
    global.Image = OriginalImage;
});

function makeFile(): File {
    return new File(['hello-bytes'], 'pic.png', { type: 'image/png' });
}

describe('resizeImage', () => {
    it('resolves a JPEG data URL using default options', async () => {
        const result = await resizeImage(makeFile());
        expect(result).toBe(FAKE_DATA_URL);
        expect(drawImage).toHaveBeenCalledTimes(1);
        // default quality 1.0 forwarded to toDataURL
        expect(toDataURLSpy).toHaveBeenCalledWith('image/jpeg', 1.0);
    });

    it('honours custom width/height/quality options', async () => {
        const result = await resizeImage(makeFile(), {
            width: 400,
            height: 400,
            quality: 0.5,
        });
        expect(result).toBe(FAKE_DATA_URL);
        expect(toDataURLSpy).toHaveBeenCalledWith('image/jpeg', 0.5);
    });

    it('covers the "source is wider" crop branch (sourceRatio > targetRatio)', async () => {
        // 1600x400 source (ratio 4.0) into 400x400 target (ratio 1.0)
        MockImage.nextW = 1600;
        MockImage.nextH = 400;
        await resizeImage(makeFile(), { width: 400, height: 400 });
        const [, offsetX, offsetY, cropW, cropH] = drawImage.mock.calls[0];
        expect(cropW).toBe(400); // img.height * targetRatio = 400 * 1
        expect(cropH).toBe(400);
        expect(offsetX).toBe((1600 - 400) / 2);
        expect(offsetY).toBe(0);
    });

    it('covers the "source is taller/equal" crop branch (else)', async () => {
        // 400x1600 source (ratio 0.25) into 400x400 target (ratio 1.0)
        MockImage.nextW = 400;
        MockImage.nextH = 1600;
        await resizeImage(makeFile(), { width: 400, height: 400 });
        const [, offsetX, offsetY, cropW, cropH] = drawImage.mock.calls[0];
        expect(cropW).toBe(400);
        expect(cropH).toBe(400); // img.width / targetRatio = 400 / 1
        expect(offsetX).toBe(0);
        expect(offsetY).toBe((1600 - 400) / 2);
    });

    it('rejects when the 2D context is unavailable', async () => {
        getContextReturn = null;
        await expect(resizeImage(makeFile())).rejects.toThrow(
            'Canvas 2D context unavailable',
        );
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('rejects when the image fails to load', async () => {
        MockImage.mode = 'error';
        await expect(resizeImage(makeFile())).rejects.toThrow(
            'Image loading error',
        );
    });

    it('rejects when the FileReader errors', async () => {
        class FailingFileReader {
            onload: ((e: unknown) => void) | null = null;
            onerror: (() => void) | null = null;
            readAsDataURL() {
                queueMicrotask(() => this.onerror?.());
            }
        }
        const OriginalFR = global.FileReader;
        // @ts-expect-error — swap in the failing reader.
        global.FileReader = FailingFileReader;
        try {
            await expect(resizeImage(makeFile())).rejects.toThrow(
                'FileReader error while reading image',
            );
        } finally {
            global.FileReader = OriginalFR;
        }
    });
});
