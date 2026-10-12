// Writes the BMP test fixtures. Deterministic, no dependencies: a gradient in
// 24-bit, the same in an 8-bit palette, and a 32-bit image with real alpha.
// Run once: node scripts/make-bmp-fixtures.mjs
import { writeFileSync } from 'node:fs';

const W = 64;
const H = 48;
const pixel = (x, y) => [Math.round((x / (W - 1)) * 255), Math.round((y / (H - 1)) * 255), 128];

function header(fileSize, dataOffset) {
  const b = Buffer.alloc(14);
  b.write('BM', 0);
  b.writeUInt32LE(fileSize, 2);
  b.writeUInt32LE(dataOffset, 10);
  return b;
}

function info(bpp, compression, imageSize, colours, extra = 0) {
  const b = Buffer.alloc(40 + extra);
  b.writeUInt32LE(40 + extra, 0);
  b.writeInt32LE(W, 4);
  b.writeInt32LE(H, 8); // positive: rows stored bottom-up
  b.writeUInt16LE(1, 12);
  b.writeUInt16LE(bpp, 14);
  b.writeUInt32LE(compression, 16);
  b.writeUInt32LE(imageSize, 20);
  b.writeUInt32LE(colours, 32);
  return b;
}

// 24-bit, rows padded to 4 bytes, BGR.
{
  const stride = Math.ceil((W * 3) / 4) * 4;
  const data = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, H - 1 - y);
      data.set([b, g, r], y * stride + x * 3);
    }
  }
  const head = info(24, 0, data.length, 0);
  writeFileSync('tests/fixtures/gradient-24.bmp', Buffer.concat([header(54 + data.length, 54), head, data]));
}

// 8-bit with a 16-colour palette.
{
  const palette = Buffer.alloc(16 * 4);
  for (let i = 0; i < 16; i++) palette.set([i * 16, 255 - i * 16, i * 8, 0], i * 4);
  const stride = Math.ceil(W / 4) * 4;
  const data = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * stride + x] = (x >> 2) % 16;
  const head = info(8, 0, data.length, 16);
  const offset = 54 + palette.length;
  writeFileSync('tests/fixtures/palette-8.bmp', Buffer.concat([header(offset + data.length, offset), head, palette, data]));
}

// 32-bit BI_BITFIELDS with an alpha mask (BITMAPV4-style masks after the header).
{
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, H - 1 - y);
      const a = x < W / 2 ? 255 : 96;
      data.set([b, g, r, a], (y * W + x) * 4);
    }
  }
  const head = info(32, 3, data.length, 0, 16);
  head.writeUInt32LE(0x00ff0000, 40); // red
  head.writeUInt32LE(0x0000ff00, 44); // green
  head.writeUInt32LE(0x000000ff, 48); // blue
  head.writeUInt32LE(0xff000000, 52); // alpha
  const offset = 14 + head.length;
  writeFileSync('tests/fixtures/alpha-32.bmp', Buffer.concat([header(offset + data.length, offset), head, data]));
}
