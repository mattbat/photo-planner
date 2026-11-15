import { fitWithin } from '../poses/labels';

/** Longest side of a stored photo (T8). */
export const MAX_PHOTO_SIDE = 1600;

export interface ResizedPhoto {
  dataUrl: string;
  width: number;
  height: number;
}

/** Shrinks a photo on the phone to a JPEG data URL, longest side 1600 px (T8). */
export async function resizePhoto(file: Blob, max = MAX_PHOTO_SIDE): Promise<ResizedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file could not be read as a picture.'));
      el.src = url;
    });
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize pictures.');
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** URL of a starter illustration, which sits under the app's base path. */
export function poseImageSrc(image: string): string {
  return `${import.meta.env.BASE_URL}${image}`;
}
