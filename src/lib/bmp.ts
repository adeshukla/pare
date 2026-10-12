/**
 * A BMP decoder, for the one place the browser cannot do it: a worker with no
 * OffscreenCanvas (WebKit). Everywhere else createImageBitmap decodes BMP and
 * this never runs. ADR-026.
 *
 * Covers what BMPs in the wild actually are: 1, 4, 8, 16, 24 and 32 bits per
 * pixel, uncompressed or with bit-field masks, stored bottom-up or top-down.
 * RLE-compressed files are rare enough that they are refused rather than
 * guessed at - the pipeline then copies them through unchanged and says so.
 */

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

const BI_RGB = 0;
const BI_BITFIELDS = 3;
const BI_ALPHABITFIELDS = 6;

/** Shift and width of a contiguous bit mask, for scaling a channel to 0-255. */
function channel(mask: number) {
  if (mask === 0) return { shift: 0, bits: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  let bits = 0;
  while (((mask >>> (shift + bits)) & 1) === 1) bits++;
  return { shift, bits };
}

export function decodeBmp(bytes: Uint8Array): Pixels {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error('not a BMP');

  const dataOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);

  let width: number;
  let rawHeight: number;
  let bpp: number;
  let compression = BI_RGB;
  let colours = 0;

  if (headerSize === 12) {
    // OS/2 BITMAPCOREHEADER: 16-bit dimensions, 3-byte palette entries.
    width = view.getUint16(18, true);
    rawHeight = view.getInt16(20, true);
    bpp = view.getUint16(24, true);
  } else {
    width = view.getInt32(18, true);
    rawHeight = view.getInt32(22, true);
    bpp = view.getUint16(28, true);
    compression = view.getUint32(30, true);
    colours = view.getUint32(46, true);
  }

  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  if (width <= 0 || height <= 0 || width > 30000 || height > 30000) {
    throw new Error('implausible BMP dimensions');
  }
  if (compression !== BI_RGB && compression !== BI_BITFIELDS && compression !== BI_ALPHABITFIELDS) {
    throw new Error('compressed BMP is not supported');
  }

  // Bit-field masks: after a 40-byte header when BI_BITFIELDS, inside larger headers.
  let masks = { r: 0, g: 0, b: 0, a: 0 };
  if (compression !== BI_RGB) {
    const at = 14 + 40;
    masks = {
      r: view.getUint32(at, true),
      g: view.getUint32(at + 4, true),
      b: view.getUint32(at + 8, true),
      a: compression === BI_ALPHABITFIELDS || headerSize >= 56 ? view.getUint32(at + 12, true) : 0,
    };
  } else if (bpp === 16) {
    masks = { r: 0x7c00, g: 0x03e0, b: 0x001f, a: 0 };
  } else if (bpp === 32) {
    masks = { r: 0x00ff0000, g: 0x0000ff00, b: 0x000000ff, a: 0 };
  }

  // Palette for indexed images.
  const palette: Array<[number, number, number]> = [];
  if (bpp <= 8) {
    const entry = headerSize === 12 ? 3 : 4;
    const count = colours || 1 << bpp;
    const start = 14 + headerSize;
    for (let i = 0; i < count; i++) {
      const p = start + i * entry;
      palette.push([bytes[p + 2] ?? 0, bytes[p + 1] ?? 0, bytes[p] ?? 0]);
    }
  }

  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  if (dataOffset + stride * height > bytes.length) throw new Error('BMP is truncated');

  const out = new Uint8ClampedArray(width * height * 4);
  const ch = { r: channel(masks.r), g: channel(masks.g), b: channel(masks.b), a: channel(masks.a) };
  const scale = (value: number, c: { shift: number; bits: number }) =>
    c.bits === 0 ? 255 : Math.round((((value >>> c.shift) & ((1 << c.bits) - 1)) * 255) / ((1 << c.bits) - 1));

  let sawAlpha = false;

  for (let y = 0; y < height; y++) {
    const row = dataOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r: number, g: number, b: number, a = 255;

      if (bpp <= 8) {
        const bit = x * bpp;
        const byte = bytes[row + (bit >> 3)]!;
        const index = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        [r, g, b] = palette[index] ?? [0, 0, 0];
      } else if (bpp === 24) {
        const p = row + x * 3;
        b = bytes[p]!;
        g = bytes[p + 1]!;
        r = bytes[p + 2]!;
      } else if (bpp === 16 || bpp === 32) {
        const value = bpp === 16 ? view.getUint16(row + x * 2, true) : view.getUint32(row + x * 4, true);
        r = scale(value, ch.r);
        g = scale(value, ch.g);
        b = scale(value, ch.b);
        if (ch.a.bits > 0) {
          a = scale(value, ch.a);
          if (a !== 0) sawAlpha = true;
        }
      } else {
        throw new Error(`${bpp}-bit BMP is not supported`);
      }

      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }

  // An alpha mask that is zero everywhere means "unused", not "invisible".
  if (ch.a.bits > 0 && !sawAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;

  return { width, height, data: out };
}
