/**
 * Image compression utility for mobile photo capture.
 *
 * Resizes images to a max dimension and compresses as JPEG
 * to reduce IndexedDB storage and upload bandwidth.
 */

const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.7;

/**
 * Compress an image file to a base64 data URL.
 *
 * - Resizes to fit within MAX_DIMENSION x MAX_DIMENSION
 * - Converts to JPEG at 70% quality
 * - Returns a data:image/jpeg;base64,... string
 *
 * Args:
 *   file: Image file from input or camera capture.
 *
 * Returns:
 *   Compressed base64 data URL string.
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");

        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height / width) * MAX_DIMENSION);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width / height) * MAX_DIMENSION);
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
