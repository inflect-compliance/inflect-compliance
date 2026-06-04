/**
 * First-party client-side image resizer.
 *
 * Replaces the `resizeImage` helper formerly pulled from the
 * `Dub utils` shim. Same contract: read a `File`, cover-fit + centre-
 * crop it to the target dimensions on a canvas, and resolve a base64
 * JPEG data URL.
 */

export interface ResizeImageOptions {
    width: number;
    height: number;
    /** JPEG quality 0..1 (default 1.0). */
    quality?: number;
}

const DEFAULT_OPTS: ResizeImageOptions = {
    width: 1200,
    height: 630,
    quality: 1.0,
};

export function resizeImage(
    file: File,
    opts: ResizeImageOptions = DEFAULT_OPTS,
): Promise<string> {
    const { width: targetW, height: targetH, quality = 1.0 } = opts;

    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () =>
            reject(new Error('FileReader error while reading image'));

        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Image loading error'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetW;
                canvas.height = targetH;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas 2D context unavailable'));
                    return;
                }
                ctx.imageSmoothingQuality = 'high';

                // Cover-fit: pick the source rectangle that fills the
                // target aspect ratio without distortion, centred.
                const targetRatio = targetW / targetH;
                const sourceRatio = img.width / img.height;

                let cropW = img.width;
                let cropH = img.height;
                if (sourceRatio > targetRatio) {
                    // Source is wider — crop the sides.
                    cropW = img.height * targetRatio;
                } else {
                    // Source is taller (or equal) — crop top/bottom.
                    cropH = img.width / targetRatio;
                }
                const offsetX = (img.width - cropW) / 2;
                const offsetY = (img.height - cropH) / 2;

                ctx.drawImage(
                    img,
                    offsetX,
                    offsetY,
                    cropW,
                    cropH,
                    0,
                    0,
                    targetW,
                    targetH,
                );

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target?.result as string;
        };

        reader.readAsDataURL(file);
    });
}
