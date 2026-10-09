// Turns a picked or captured picture into a clean JPEG for storage: drawn onto a canvas and re-encoded
// (longest side ≤ 1600 px, quality 0.85). Re-encoding drops EXIF, GPS and camera details; stripJpegMetadata
// double-checks the result in case a browser ever keeps any.
import { fitSize, MAX_SIDE, JPEG_QUALITY, hasExif, stripJpegMetadata } from './core.js';

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const canvasBlob = (canvas, type = 'image/jpeg', q = JPEG_QUALITY) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t prepare that picture.'))), type, q));

/** File → { blob, w, h } with no metadata. */
export async function prepareJpeg(file) {
  const src = await decode(file);
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  const { w, h } = fitSize(sw, sh, MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  let blob = await canvasBlob(canvas);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (hasExif(bytes)) blob = new Blob([stripJpegMetadata(bytes)], { type: 'image/jpeg' });
  return { blob, w, h };
}
