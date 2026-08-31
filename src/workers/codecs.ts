/**
 * Every codec is loaded with a dynamic import on first use.
 *
 * This file is the reason the initial bundle stays under budget: none of these
 * modules — nor the multi-megabyte WASM behind them — appear in the entry graph.
 * A visitor who never drops a file downloads none of it. Keep it that way: no
 * static import of `@jsquash/*` anywhere in the tree.
 */

import type { OutputFormat } from '../lib/settings';

export const MIME_FOR_FORMAT: Record<Exclude<OutputFormat, 'fallback'>, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
};

export async function encodeAvif(data: ImageData, quality: number): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/avif/encode');
  // speed 6 is the point where encode time stops being the bottleneck for a
  // batch drop without giving up a meaningful amount of compression.
  return new Uint8Array(await encode(data, { quality, speed: 6 }));
}

export async function encodeWebp(data: ImageData, quality: number): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/webp/encode');
  return new Uint8Array(await encode(data, { quality }));
}

/** MozJPEG. Progressive by default, which is both smaller and renders sooner. */
export async function encodeJpeg(data: ImageData, quality: number): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/jpeg/encode');
  return new Uint8Array(await encode(data, { quality }));
}

/** PNG encode then OxiPNG. Lossless both ways — quality does not apply. */
export async function encodePng(data: ImageData): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/png/encode');
  const raw = new Uint8Array(await encode(data));
  try {
    const { default: optimise } = await import('@jsquash/oxipng/optimise');
    const squeezed = new Uint8Array(await optimise(toArrayBuffer(raw), { level: 3 }));
    return squeezed.byteLength < raw.byteLength ? squeezed : raw;
  } catch {
    // OxiPNG is a bonus pass. Losing it costs bytes, not correctness.
    return raw;
  }
}

/** jsquash decoders take a standalone ArrayBuffer, not a view into a larger one. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Some jsquash decoders resolve to null rather than rejecting. Normalise that. */
function orThrow(data: ImageData | null, mime: string): ImageData {
  if (!data) throw new Error('decoder returned nothing for ' + mime);
  return data;
}

export async function resize(
  data: ImageData,
  width: number,
  height: number,
): Promise<ImageData> {
  const { default: run } = await import('@jsquash/resize');
  return run(data, { width, height });
}

/**
 * Decode order: the browser first, WASM only if it refuses.
 *
 * AGENTS.md says prefer a native API where one exists, and `createImageBitmap`
 * decodes every format we accept — including the first frame of an animated GIF —
 * for zero bytes of payload. `imageOrientation: 'from-image'` bakes EXIF rotation
 * into the pixels here, which is what makes it safe to drop EXIF later.
 *
 * The WASM fallback covers browsers whose native AVIF or WebP decode is missing.
 */
export async function decode(bytes: Uint8Array, mime: string): Promise<ImageData> {
  try {
    return await decodeNative(bytes, mime);
  } catch (native) {
    try {
      return await decodeWasm(bytes, mime);
    } catch {
      throw native;
    }
  }
}

async function decodeNative(bytes: Uint8Array, mime: string): Promise<ImageData> {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('no native decoder in this context');
  }
  const blob = new Blob([bytes as BufferSource], { type: mime });
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function decodeWasm(bytes: Uint8Array, mime: string): Promise<ImageData> {
  const buf = toArrayBuffer(bytes);
  switch (mime) {
    case 'image/jpeg': {
      const { default: d } = await import('@jsquash/jpeg/decode');
      return orThrow(await d(buf), mime);
    }
    case 'image/png': {
      const { default: d } = await import('@jsquash/png/decode');
      return orThrow(await d(buf), mime);
    }
    case 'image/webp': {
      const { default: d } = await import('@jsquash/webp/decode');
      return orThrow(await d(buf), mime);
    }
    case 'image/avif': {
      const { default: d } = await import('@jsquash/avif/decode');
      return orThrow(await d(buf), mime);
    }
    default:
      throw new Error(`no decoder for ${mime}`);
  }
}

/** ThumbHash caps input at 100px per side, so downscale before hashing. */
export async function placeholder(data: ImageData): Promise<string> {
  const scale = Math.min(1, 100 / Math.max(data.width, data.height));
  const w = Math.max(1, Math.round(data.width * scale));
  const h = Math.max(1, Math.round(data.height * scale));
  const small = scale < 1 ? await resize(data, w, h) : data;

  const { rgbaToThumbHash, thumbHashToDataURL } = await import('thumbhash');
  const hash = rgbaToThumbHash(small.width, small.height, small.data);
  return thumbHashToDataURL(hash);
}
