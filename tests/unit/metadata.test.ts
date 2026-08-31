import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hasNonDefaultOrientation,
  stripJpeg,
  stripMetadata,
  stripPng,
} from '../../src/lib/metadata';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));

/* ---------- helpers that build real segments, not mocks ---------- */

/** A minimal but structurally valid EXIF APP1 carrying one Orientation tag. */
function exifApp1(orientation: number): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, // "II", 42 - little-endian TIFF
    0x08, 0x00, 0x00, 0x00, // IFD0 at offset 8
    0x01, 0x00, // one entry
    0x12, 0x01, // tag 0x0112 Orientation
    0x03, 0x00, // type SHORT
    0x01, 0x00, 0x00, 0x00, // count 1
    orientation & 0xff, 0x00, 0x00, 0x00, // value, padded to 4 bytes
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const len = 2 + header.length + tiff.length;
  return new Uint8Array([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...header, ...tiff]);
}

/** An APP2 segment tagged as an ICC profile, which must survive stripping. */
function iccApp2(): Uint8Array {
  const tag = [...'ICC_PROFILE\0'].map((c) => c.charCodeAt(0));
  const body = [...tag, 1, 1, 0xde, 0xad, 0xbe, 0xef];
  const len = 2 + body.length;
  return new Uint8Array([0xff, 0xe2, (len >> 8) & 0xff, len & 0xff, ...body]);
}

/** A JPEG comment segment. Pure noise, always safe to drop. */
function comment(text: string): Uint8Array {
  const body = [...text].map((c) => c.charCodeAt(0));
  const len = 2 + body.length;
  return new Uint8Array([0xff, 0xfe, (len >> 8) & 0xff, len & 0xff, ...body]);
}

/** Splice segments in immediately after SOI, where a camera would put them. */
function injectAfterSoi(jpeg: Uint8Array, ...segments: Uint8Array[]): Uint8Array {
  const extra = segments.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(jpeg.length + extra);
  out.set(jpeg.subarray(0, 2), 0);
  let at = 2;
  for (const s of segments) {
    out.set(s, at);
    at += s.length;
  }
  out.set(jpeg.subarray(2), at);
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: number[]): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A real tEXt chunk, CRC and all, inserted straight after IHDR. */
function injectPngText(png: Uint8Array, keyword: string, value: string): Uint8Array {
  const body = [...`${keyword}\0${value}`].map((c) => c.charCodeAt(0));
  const type = [...'tEXt'].map((c) => c.charCodeAt(0));
  const crc = crc32([...type, ...body]);
  const chunk = new Uint8Array(12 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  chunk.set(type, 4);
  chunk.set(body, 8);
  view.setUint32(8 + body.length, crc);

  // IHDR is always the first chunk: 8 signature + 4 length + 4 type + 13 + 4 crc.
  const at = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

/* ---------- tests ---------- */

describe('stripJpeg', () => {
  const clean = stripJpeg(fixture('photo.jpg')).bytes;

  it('removes EXIF, comments and vendor segments', () => {
    const dirty = injectAfterSoi(
      fixture('photo.jpg'),
      exifApp1(1),
      comment('written by some camera'),
    );
    const result = stripJpeg(dirty);

    expect(result.removed).toBeGreaterThan(0);
    expect(result.bytes.byteLength).toBeLessThan(dirty.byteLength);
    // Everything the injection added is gone, and nothing else went with it.
    expect(Array.from(result.bytes)).toEqual(Array.from(clean));
  });

  it('keeps ICC colour profiles, because they change what is painted', () => {
    const icc = iccApp2();
    const dirty = injectAfterSoi(fixture('photo.jpg'), exifApp1(1), icc);
    const result = stripJpeg(dirty);

    expect(result.bytes.byteLength).toBe(clean.byteLength + icc.byteLength);
    expect(indexOfSequence(result.bytes, [...'ICC_PROFILE'].map((c) => c.charCodeAt(0)))).toBeGreaterThan(0);
  });

  it('refuses to strip when EXIF carries the rotation the image needs', () => {
    // Dropping Orientation here would silently turn the photo on its side.
    const rotated = injectAfterSoi(fixture('photo.jpg'), exifApp1(6));
    const result = stripJpeg(rotated);

    expect(result.removed).toBe(0);
    expect(result.skipped).toMatch(/rotation/i);
    expect(result.bytes).toBe(rotated);
  });

  it('leaves the entropy-coded image data byte-for-byte identical', () => {
    const dirty = injectAfterSoi(fixture('photo.jpg'), comment('x'.repeat(200)));
    const result = stripJpeg(dirty);
    const tail = 4096;
    expect(Array.from(result.bytes.subarray(result.bytes.length - tail))).toEqual(
      Array.from(dirty.subarray(dirty.length - tail)),
    );
  });

  it('returns a truncated or non-JPEG file untouched instead of throwing', () => {
    const broken = fixture('broken.jpg');
    expect(stripJpeg(broken).bytes).toBe(broken);
    expect(stripJpeg(broken).removed).toBe(0);

    const notJpeg = fixture('flat.png');
    expect(stripJpeg(notJpeg).skipped).toBe('not a JPEG');
  });
});

describe('hasNonDefaultOrientation', () => {
  it('is true only when the tag says something other than 1', () => {
    expect(hasNonDefaultOrientation(injectAfterSoi(fixture('photo.jpg'), exifApp1(6)))).toBe(true);
    expect(hasNonDefaultOrientation(injectAfterSoi(fixture('photo.jpg'), exifApp1(1)))).toBe(false);
    expect(hasNonDefaultOrientation(fixture('photo.jpg'))).toBe(false);
  });
});

describe('stripPng', () => {
  it('removes tEXt chunks and leaves the rest of the file intact', () => {
    const original = fixture('flat.png');
    const dirty = injectPngText(original, 'Software', 'some editor 1.0');
    const result = stripPng(dirty);

    expect(result.removed).toBe(dirty.byteLength - original.byteLength);
    expect(Array.from(result.bytes)).toEqual(Array.from(stripPng(original).bytes));
  });

  it('leaves a PNG with nothing to remove exactly as it was', () => {
    const original = fixture('flat.png');
    const result = stripPng(original);
    expect(result.removed).toBe(0);
    expect(result.bytes).toBe(original);
  });

  it('declines a file that is not a PNG', () => {
    expect(stripPng(fixture('photo.jpg')).skipped).toBe('not a PNG');
  });
});

describe('stripMetadata', () => {
  it('dispatches on mime and passes unknown types through', () => {
    expect(stripMetadata(fixture('photo.jpg'), 'image/jpeg').skipped).toBeUndefined();
    expect(stripMetadata(fixture('flat.png'), 'image/png').skipped).toBeUndefined();

    const webp = new Uint8Array([1, 2, 3, 4]);
    const result = stripMetadata(webp, 'image/webp');
    expect(result.bytes).toBe(webp);
    expect(result.skipped).toContain('image/webp');
  });
});

function indexOfSequence(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
