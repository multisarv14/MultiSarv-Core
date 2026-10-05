/** Logo sathi chalnare formats ani original file chi maximum size. */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export class ImageError extends Error {
  constructor(public reason: "type" | "size" | "read") {
    super(reason);
  }
}

/**
 * Image chhota karun PNG data URL (max `max` px) — Firestore doc madhe thevta yeto,
 * Storage setup nako. Company logo ani project logo donhi hech vapartat.
 */
export function shrinkImage(file: File, max = 256): Promise<string> {
  if (!LOGO_TYPES.includes(file.type)) return Promise.reject(new ImageError("type"));
  if (file.size > LOGO_MAX_BYTES) return Promise.reject(new ImageError("size"));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
      const canvas = Object.assign(document.createElement("canvas"), {
        width: Math.max(1, Math.round((img.width || max) * scale)),
        height: Math.max(1, Math.round((img.height || max) * scale)),
      });
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new ImageError("read"));
    img.src = URL.createObjectURL(file);
  });
}
