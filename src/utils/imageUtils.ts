export const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => {
            console.error("Image load error:", error);
            reject(new Error("Resim yüklenemedi. Lütfen dosya formatını kontrol edin."));
        });
        if (!url.startsWith('blob:')) {
            image.setAttribute('crossOrigin', 'anonymous');
        }
        image.src = url;
    });

export async function getCroppedImg(
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<string | null> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = 256;
    canvas.height = 256;

    try {
        ctx.drawImage(
            image,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            256,
            256
        );
    } catch (e) {
        console.error("Canvas draw error:", e);
        throw new Error("Resim işlenirken bir hata oluştu (Canvas).");
    }

    // Return as Base64 string (JPEG 80% quality for small size)
    return canvas.toDataURL('image/jpeg', 0.8);
}
