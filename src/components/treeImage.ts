import { shareBlob, type ShareOutcome } from '../data/share';
import { layoutTree } from '../tree/layout';
import type { TreePerson } from '../tree/types';
import { exportTreeSvg } from './exportTreeSvg';

/** Draws standalone SVG markup onto a canvas and returns a PNG (V9). */
export async function svgToPng(svg: string, width: number, height: number, maxSide = 4096): Promise<Blob> {
  const scale = Math.min(2, maxSide / Math.max(width, height));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The picture could not be drawn.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The picture could not be drawn.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be saved.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shares the whole tree as a PNG (share sheet on iPhone, a download elsewhere). */
export async function shareTreeImage(people: TreePerson[], filename: string): Promise<ShareOutcome> {
  const { width, height } = layoutTree(people);
  const png = await svgToPng(exportTreeSvg(people), width, height);
  return shareBlob(filename, png);
}
