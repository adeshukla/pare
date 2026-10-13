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

/**
 * Download and compile the encoders a run is about to need, ahead of time. Each
 * is the same init the first encode would do, so a warmed worker just skips
 * that wait. Failures are ignored: the encode will try again and report.
 */
export async function warmEncoders(kinds: string[]): Promise<void> {
  const loads: Record<string, () => Promise<unknown>> = {
    avif: async () => (await import('@jsquash/avif/encode')).init(),
    webp: async () => (await import('@jsquash/webp/encode')).init(),
    jpeg: async () => (await import('@jsquash/jpeg/encode')).init(),
    png: async () => {
      await (await import('@jsquash/png/encode')).init();
      await (await import('@jsquash/oxipng/optimise')).init();
    },
  };
  const rest: Record<string, () => Promise<unknown>> = {
    resize: async () => import('@jsquash/resize'),
    heic: async () => (await import('./heic')).warmHeic(),
    harfbuzz: async () => (await import('./font-codecs')).warmFont('harfbuzz'),
    woff2: async () => (await import('./font-codecs')).warmFont('woff2'),
  };
  const text = ['lightning', 'esbuild', 'svgo', 'html', 'terser', 'brotli'];
  await Promise.all(
    kinds.map((k) =>
      (loads[k] ?? rest[k] ?? (text.includes(k) ? async () => (await import('./text-codecs')).warmText(k) : undefined))?.().catch(
        () => undefined,
      ),
    ),
  );
}

export async function encodeAvif(data: ImageData, quality: number): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/avif/encode');
  // speed 7, measured on a real iPhone photo (tests/fixtures/photo.heic, q50):
  //   speed 6  175.5 KB   8.7 s Chromium  70.1 s Firefox
  //   speed 7  168.1 KB   4.1 s           28.7 s
  //   speed 8  257.2 KB   1.0 s            9.0 s
  // 7 is both smaller and more than twice as fast as 6; 8 is fast but costs
  // nearly half again in bytes, which is the one thing Pare is for.
  const speed = 7;
  return new Uint8Array(await encode(data, { quality, speed }));
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

/**
 * Decode straight to a smaller size, for an image too big to hold at full size.
 *
 * ARCHITECTURE.md: out of memory on a large image means downscale first, retry
 * once, then skip. The browser can scale during decode, so the full-size pixels
 * never have to exist in this worker at all. Height follows the aspect ratio.
 */
export function decodeScaled(bytes: Uint8Array, mime: string, width: number): Promise<ImageData> {
  return decodeNative(bytes, mime, width);
}

async function decodeNative(bytes: Uint8Array, mime: string, width?: number): Promise<ImageData> {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('no native decoder in this context');
  }
  const blob = new Blob([bytes as BufferSource], { type: mime });
  const bitmap = await createImageBitmap(
    blob,
    width
      ? { imageOrientation: 'from-image', resizeWidth: width, resizeQuality: 'high' }
      : { imageOrientation: 'from-image' },
  );
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

/** Exported so the fallback can be tested directly; Chromium never needs it. */
export async function decodeWasm(bytes: Uint8Array, mime: string): Promise<ImageData> {
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
    case 'image/bmp': {
      // Plain TypeScript, no WASM: BMP is simple enough to read directly.
      const { decodeBmp } = await import('../lib/bmp');
      const { width, height, data } = decodeBmp(bytes);
      return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);
    }
    case 'image/heic': {
      const { decodeHeic } = await import('./heic');
      return decodeHeic(bytes);
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
