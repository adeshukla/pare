import { GifWriter } from 'omggif';
import { describe, expect, it } from 'vitest';
import { frameChunks, gifFrames, gifToAnimatedWebp } from '../../src/lib/animated-webp';

/** A 4×2 GIF: frame 1 all red for 50 ms, frame 2 paints the left half blue for 1 s. */
function twoFrames(loop: number | undefined, disposal = 0): Uint8Array {
  const buf = new Uint8Array(1024);
  const writer = new GifWriter(buf, 4, 2, { palette: [0xff0000, 0x0000ff], loop });
  writer.addFrame(0, 0, 4, 2, [0, 0, 0, 0, 0, 0, 0, 0], { delay: 5, disposal });
  writer.addFrame(0, 0, 2, 2, [1, 1, 1, 1], { delay: 100 });
  return buf.slice(0, writer.end());
}

/** A stand-in for the still encoder: a RIFF/WEBP file holding one VP8L chunk. */
async function fakeEncode(rgba: Uint8ClampedArray): Promise<Uint8Array> {
  const payload = Uint8Array.from([rgba[0]!, rgba[1]!, rgba[2]!]); // odd length: needs padding
  const out = new Uint8Array(12 + 8 + 4);
  out.set([82, 73, 70, 70], 0);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  out.set([87, 69, 66, 80, 86, 80, 56, 76], 8);
  new DataView(out.buffer).setUint32(16, 3, true);
  out.set(payload, 20);
  return out;
}

const tags = (webp: Uint8Array) => {
  const out: string[] = [];
  const view = new DataView(webp.buffer, webp.byteOffset);
  for (let at = 12; at + 8 <= webp.length; ) {
    const size = view.getUint32(at + 4, true);
    out.push(String.fromCharCode(...webp.subarray(at, at + 4)));
    at += 8 + size + (size & 1);
  }
  return out;
};

describe('animated GIF to animated WebP (ADR-038)', () => {
  it('composites frames as a browser does, with delays in ms', () => {
    const frames = [...gifFrames(twoFrames(0))];
    expect(frames.map((f) => f.delay)).toEqual([50, 1000]);
    // Frame 2 painted the left half blue over frame 1's red.
    expect(Array.from(frames[1]!.rgba.slice(0, 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(frames[1]!.rgba.slice(8, 12))).toEqual([255, 0, 0, 255]);
  });

  it('clears a frame disposed to background before the next', () => {
    const frames = [...gifFrames(twoFrames(0, 2))];
    // Frame 1 is cleared, so where frame 2 does not paint is transparent.
    expect(Array.from(frames[1]!.rgba.slice(8, 12))).toEqual([0, 0, 0, 0]);
  });

  it('wraps each frame in ANMF inside a valid RIFF container', async () => {
    const webp = await gifToAnimatedWebp(twoFrames(0), fakeEncode);
    const view = new DataView(webp.buffer);
    expect(String.fromCharCode(...webp.subarray(0, 4), ...webp.subarray(8, 12))).toBe('RIFFWEBP');
    expect(view.getUint32(4, true)).toBe(webp.length - 8);
    expect(tags(webp)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF']);
    expect(webp[20]! & 0x02).toBe(0x02); // animation flag
    expect(view.getUint16(30 + 8 + 4, true)).toBe(0); // ANIM loop count: forever
    // First ANMF: 4×2 at 0,0 shown 50 ms, then its VP8L chunk.
    const anmf = 12 + 18 + 14;
    expect(Array.from(webp.subarray(anmf + 8 + 6, anmf + 8 + 15))).toEqual([3, 0, 0, 1, 0, 0, 50, 0, 0]);
    expect(String.fromCharCode(...webp.subarray(anmf + 8 + 16, anmf + 8 + 20))).toBe('VP8L');
  });

  it('plays once when the GIF has no loop extension', async () => {
    const webp = await gifToAnimatedWebp(twoFrames(undefined), fakeEncode);
    expect(new DataView(webp.buffer).getUint16(30 + 8 + 4, true)).toBe(1);
  });

  it('keeps only the image chunks of a still frame', async () => {
    const still = await fakeEncode(new Uint8ClampedArray([1, 2, 3, 255]));
    expect(String.fromCharCode(...frameChunks(still).subarray(0, 4))).toBe('VP8L');
    expect(frameChunks(still).length).toBe(8 + 4);
  });
});
