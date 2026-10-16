// Fixtures for ADR-038: TIFFs (one page, and two pages) and an animated GIF.
// The TIFFs are written byte by byte - little-endian, uncompressed 8-bit RGB,
// one strip per page - so every field is visible here. The GIF uses omggif's
// own writer. Run: node scripts/make-input-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { GifWriter } = createRequire(import.meta.url)('omggif');

function tiff(pages) {
  const ENTRIES = 9;
  const ifdSize = 2 + ENTRIES * 12 + 4;
  const extra = 6; // BitsPerSample's three shorts, stored out of line
  let size = 8;
  for (const p of pages) size += ifdSize + extra + p.rgb.length;
  const b = Buffer.alloc(size);
  b.write('II', 0);
  b.writeUInt16LE(42, 2);
  let at = 8;
  b.writeUInt32LE(at, 4);
  pages.forEach((p, n) => {
    const ifd = at;
    const bits = ifd + ifdSize;
    const data = bits + extra;
    const next = n + 1 < pages.length ? data + p.rgb.length : 0;
    const tags = [
      [256, 3, 1, p.width], // ImageWidth
      [257, 3, 1, p.height], // ImageLength
      [258, 3, 3, bits], // BitsPerSample -> 8,8,8
      [259, 3, 1, 1], // Compression: none
      [262, 3, 1, 2], // Photometric: RGB
      [273, 4, 1, data], // StripOffsets
      [277, 3, 1, 3], // SamplesPerPixel
      [278, 3, 1, p.height], // RowsPerStrip
      [279, 4, 1, p.rgb.length], // StripByteCounts
    ];
    b.writeUInt16LE(ENTRIES, ifd);
    tags.forEach(([tag, type, count, value], i) => {
      const e = ifd + 2 + i * 12;
      b.writeUInt16LE(tag, e);
      b.writeUInt16LE(type, e + 2);
      b.writeUInt32LE(count, e + 4);
      if (type === 3 && count === 1) b.writeUInt16LE(value, e + 8);
      else b.writeUInt32LE(value, e + 8);
    });
    b.writeUInt32LE(next, ifd + 2 + ENTRIES * 12);
    b.writeUInt16LE(8, bits);
    b.writeUInt16LE(8, bits + 2);
    b.writeUInt16LE(8, bits + 4);
    Buffer.from(p.rgb).copy(b, data);
    at = data + p.rgb.length;
  });
  return b;
}

const W = 96;
const H = 64;
const rgb = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) rgb.set([Math.round((x / W) * 255), Math.round((y / H) * 255), 160], (y * W + x) * 3);
}
writeFileSync('tests/fixtures/gradient.tif', tiff([{ width: W, height: H, rgb }]));
writeFileSync(
  'tests/fixtures/two-pages.tif',
  tiff([{ width: W, height: H, rgb }, { width: W, height: H, rgb: rgb.slice().reverse() }]),
);

// 64×48, 8 frames of a square moving across a white background, looping.
const gw = 64;
const gh = 48;
const buf = new Uint8Array(64 * 1024);
const gif = new GifWriter(buf, gw, gh, { palette: [0xffffff, 0x4f46e5, 0xf59e0b, 0x10b981], loop: 0 });
for (let f = 0; f < 8; f++) {
  const px = new Array(gw * gh).fill(0);
  for (let y = 12; y < 36; y++) for (let x = f * 5; x < f * 5 + 24; x++) px[y * gw + x] = 1 + (f % 3);
  gif.addFrame(0, 0, gw, gh, px, { delay: 8 });
}
writeFileSync('tests/fixtures/animated-flat.gif', buf.slice(0, gif.end()));

// 160×120, 10 frames of a photo-like scene: a 256-colour gradient with grain
// that drifts each frame - what GIF compresses worst and WebP best.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) / 65536;
const pw = 160;
const ph = 120;
const ramp = Array.from({ length: 256 }, (_, i) => ((i & 0xe0) << 16) | ((i & 0x1c) << 11) | ((i & 0x03) << 6));
const big = new Uint8Array(1024 * 1024);
const photo = new GifWriter(big, pw, ph, { palette: ramp, loop: 0 });
for (let f = 0; f < 10; f++) {
  const px = new Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const r = Math.min(7, Math.max(0, Math.round(((x + f * 6) % pw) / pw * 7 + (rand() - 0.5) * 2)));
      const g = Math.min(7, Math.max(0, Math.round(y / ph * 7 + (rand() - 0.5) * 2)));
      const b = Math.min(3, Math.max(0, Math.round(((x + y) / (pw + ph)) * 3 + (rand() - 0.5))));
      px[y * pw + x] = (r << 5) | (g << 2) | b;
    }
  }
  photo.addFrame(0, 0, pw, ph, px, { delay: 10 });
}
writeFileSync('tests/fixtures/animated.gif', big.slice(0, photo.end()));
console.log('wrote gradient.tif, two-pages.tif, animated-flat.gif, animated.gif');
