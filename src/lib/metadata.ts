/**
 * Metadata stripping for the passthrough path — when we keep the original file
 * because re-encoding it would not win, we can still drop the camera's baggage.
 *
 * What comes out and what stays is a deliberate line:
 *
 *   Removed  EXIF, XMP, IPTC, Photoshop resources, JPEG/PNG comments, timestamps.
 *            None of it affects what a browser paints.
 *   Kept     ICC colour profiles, gAMA/cHRM/sRGB. These change the pixels on
 *            screen. Dropping them would shift colour, which is exactly the kind
 *            of silent visual change Law 2 exists to prevent.
 *
 * EXIF Orientation is the one removal that could rotate an image. The decoder is
 * given `imageOrientation: 'from-image'` and bakes rotation into the pixels
 * before we get here, so an image that has been through the encoder is already
 * upright. See stripJpeg's guard for the untouched-original case.
 */

const isMarker = (b: Uint8Array, i: number) => b[i] === 0xff && (b[i + 1] ?? 0) !== 0x00;

/** True when an APP2 segment carries an ICC profile, which we must not remove. */
function isIccSegment(b: Uint8Array, start: number): boolean {
  const tag = 'ICC_PROFILE\0';
  return [...tag].every((c, i) => b[start + i] === c.charCodeAt(0));
}

/** EXIF Orientation other than 1 means the file relies on metadata to display right. */
export function hasNonDefaultOrientation(b: Uint8Array): boolean {
  // Cheap scan: find "Exif\0\0" then read the TIFF header and orientation tag.
  for (let i = 2; i + 10 < b.length; i++) {
    if (b[i] !== 0x45 || b[i + 1] !== 0x78 || b[i + 2] !== 0x69 || b[i + 3] !== 0x66) continue;
    if (b[i + 4] !== 0 || b[i + 5] !== 0) continue;
    const tiff = i + 6;
    const little = b[tiff] === 0x49;
    const view = new DataView(b.buffer, b.byteOffset + tiff, Math.min(b.length - tiff, 4096));
    try {
      const ifd = view.getUint32(4, little);
      const count = view.getUint16(ifd, little);
      for (let e = 0; e < count; e++) {
        const off = ifd + 2 + e * 12;
        if (view.getUint16(off, little) === 0x0112) {
          return view.getUint16(off + 8, little) > 1;
        }
      }
    } catch {
      // Truncated or malformed EXIF. Assume the worst and keep it.
      return true;
    }
    return false;
  }
  return false;
}

export type StripResult = { bytes: Uint8Array; removed: number; skipped?: string };

function unchanged(bytes: Uint8Array, skipped?: string): StripResult {
  return { bytes, removed: 0, skipped };
}

export function stripJpeg(input: Uint8Array): StripResult {
  if (input[0] !== 0xff || input[1] !== 0xd8) return unchanged(input, 'not a JPEG');
  if (hasNonDefaultOrientation(input)) {
    // Removing EXIF here would rotate the image in the browser. Leave it whole.
    return unchanged(input, 'kept EXIF because it carries the rotation this image needs');
  }

  const keep: Array<[number, number]> = [[0, 2]];
  let i = 2;

  while (i < input.length) {
    if (!isMarker(input, i)) return unchanged(input, 'unexpected byte in JPEG structure');
    const marker = input[i + 1]!;

    if (marker === 0xd9) {
      keep.push([i, input.length]);
      break;
    }
    // Start of scan: everything after this is entropy-coded image data.
    if (marker === 0xda) {
      keep.push([i, input.length]);
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      keep.push([i, i + 2]);
      i += 2;
      continue;
    }

    const len = ((input[i + 2] ?? 0) << 8) | (input[i + 3] ?? 0);
    if (len < 2 || i + 2 + len > input.length) {
      return unchanged(input, 'truncated JPEG segment');
    }
    const end = i + 2 + len;

    const isApp1 = marker === 0xe1; // EXIF and XMP both live here
    const isApp2NonIcc = marker === 0xe2 && !isIccSegment(input, i + 4);
    const isOtherApp = marker >= 0xe3 && marker <= 0xef; // Photoshop, IPTC, vendor
    const isComment = marker === 0xfe;

    if (!(isApp1 || isApp2NonIcc || isOtherApp || isComment)) keep.push([i, end]);
    i = end;
  }

  return assemble(input, keep);
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Ancillary chunks that carry no rendering information. */
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

export function stripPng(input: Uint8Array): StripResult {
  if (!PNG_SIG.every((b, i) => input[i] === b)) return unchanged(input, 'not a PNG');

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const keep: Array<[number, number]> = [[0, 8]];
  let i = 8;

  while (i + 8 <= input.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(
      input[i + 4]!, input[i + 5]!, input[i + 6]!, input[i + 7]!,
    );
    const end = i + 12 + len;
    if (end > input.length) return unchanged(input, 'truncated PNG chunk');

    if (!PNG_DROP.has(type)) keep.push([i, end]);
    i = end;
    if (type === 'IEND') break;
  }

  return assemble(input, keep);
}

function assemble(input: Uint8Array, keep: Array<[number, number]>): StripResult {
  const size = keep.reduce((n, [a, b]) => n + (b - a), 0);
  if (size === input.length) return unchanged(input);

  const out = new Uint8Array(size);
  let at = 0;
  for (const [a, b] of keep) {
    out.set(input.subarray(a, b), at);
    at += b - a;
  }
  return { bytes: out, removed: input.length - size };
}

/** Dispatch on mime. Anything we do not understand comes back untouched. */
export function stripMetadata(input: Uint8Array, mime: string): StripResult {
  if (mime === 'image/jpeg') return stripJpeg(input);
  if (mime === 'image/png') return stripPng(input);
  return unchanged(input, `no metadata stripper for ${mime}`);
}
