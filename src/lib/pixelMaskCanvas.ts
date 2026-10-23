import { MAX_PIXEL_MASK_PIXELS } from './pixelMasks.ts';

export type PngMask = { version: 1; encoding: 'image/png;base64'; width: number; height: number; data: string };

export async function decodePngMask(mask: PngMask, width: number, height: number): Promise<Uint8Array> {
  if (mask.version !== 1 || mask.encoding !== 'image/png;base64' || mask.width !== width || mask.height !== height
      || width <= 0 || height <= 0 || width * height > MAX_PIXEL_MASK_PIXELS) {
    throw new Error('The selected mask does not match this source image dimensions.');
  }
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The selected mask PNG could not be decoded.'));
    image.src = `data:image/png;base64,${mask.data}`;
  });
  if (image.naturalWidth !== width || image.naturalHeight !== height) {
    throw new Error('The selected mask PNG dimensions do not match the source image.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The source-pixel mask canvas is unavailable.');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = rgba[index * 4 + 3] ? 255 : 0;
  return alpha;
}

export function encodePngMask(alpha: Uint8Array, width: number, height: number): PngMask {
  if (width <= 0 || height <= 0 || width * height > MAX_PIXEL_MASK_PIXELS || alpha.length !== width * height) {
    throw new Error('Edited mask dimensions exceed the source-pixel processing limit.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The source-pixel mask canvas is unavailable.');
  const imageData = context.createImageData(width, height);
  for (let index = 0; index < alpha.length; index++) {
    const pixel = index * 4;
    imageData.data[pixel] = 255;
    imageData.data[pixel + 1] = 255;
    imageData.data[pixel + 2] = 255;
    imageData.data[pixel + 3] = alpha[index] ? 255 : 0;
  }
  context.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return { version: 1, encoding: 'image/png;base64', width, height, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}
