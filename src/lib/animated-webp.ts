import { GifReader } from 'omggif';

/**
 * Animated GIF to animated WebP (ADR-038, superseding ADR-022's "copy it
 * unchanged" for files mode).
 *
 * No browser-side encoder writes animated WebP, but the format is a plain RIFF
 * container around still WebP frames. So: decode the GIF's frames and composite
 * them exactly as a browser would (disposal and all), encode each full frame
 * with the ordinary still encoder, and wrap the results in ANIM/ANMF chunks.
 *
 * Pure apart from the injected `encode`, so it is tested in Node.
 */

export type GifFrames = { width: number; height: number; frames: number; loop: number | null };

export function gifInfo(bytes: Uint8Array): GifFrames {
  const gif = new GifReader(bytes);
  return { width: gif.width, height: gif.height, frames: gif.numFrames(), loop: gif.loopCount() };
}

/** Every frame as a full RGBA picture, in order, with how long it shows (ms). */
export function* gifFrames(bytes: Uint8Array): Generator<{ rgba: Uint8ClampedArray; delay: number }> {
  const gif = new GifReader(bytes);
  const canvas = new Uint8ClampedArray(gif.width * gif.height * 4);
  for (let i = 0; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i);
    const before = info.disposal === 3 ? canvas.slice() : undefined;
    gif.decodeAndBlitFrameRGBA(i, canvas);
    // Browsers show a delay of 0 or 1 (hundredths of a second) as 100 ms.
    yield { rgba: canvas.slice(), delay: info.delay <= 1 ? 100 : info.delay * 10 };
    if (info.disposal === 2) {
      // Back to transparent, as browsers do, rather than the GIF's background colour.
      for (let y = info.y; y < Math.min(gif.height, info.y + info.height); y++) {
        canvas.fill(0, (y * gif.width + info.x) * 4, (y * gif.width + Math.min(gif.width, info.x + info.width)) * 4);
      }
    } else if (before) {
      canvas.set(before);
    }
  }
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

function chunk(tag: string, payload: Uint8Array | number[]): Uint8Array {
  const body = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  const out = new Uint8Array(8 + body.length + (body.length & 1));
  out.set(ascii(tag), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The image chunks of a still WebP (ALPH, VP8 or VP8L), ready to sit in an ANMF. */
export function frameChunks(webp: Uint8Array): Uint8Array {
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  const keep: Uint8Array[] = [];
  for (let at = 12; at + 8 <= webp.length; ) {
    const tag = String.fromCharCode(...webp.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size & 1);
    if (tag === 'ALPH' || tag === 'VP8 ' || tag === 'VP8L') keep.push(webp.subarray(at, end));
    at = end;
  }
  if (keep.length === 0) throw new Error('the encoder returned no image data');
  return concat(keep);
}

/**
 * Assemble an animated WebP. `encode` turns one RGBA frame into a still WebP
 * file; `onFrame` reports progress.
 */
export async function gifToAnimatedWebp(
  bytes: Uint8Array,
  encode: (rgba: Uint8ClampedArray, width: number, height: number) => Promise<Uint8Array>,
  onFrame: (done: number, total: number) => void = () => {},
): Promise<Uint8Array> {
  const { width, height, frames: total, loop } = gifInfo(bytes);
  const frames: Uint8Array[] = [];
  let alpha = false;
  let done = 0;
  for (const frame of gifFrames(bytes)) {
    for (let i = 3; i < frame.rgba.length && !alpha; i += 4) if (frame.rgba[i] !== 255) alpha = true;
    const data = frameChunks(await encode(frame.rgba, width, height));
    frames.push(
      chunk(
        'ANMF',
        concat([
          // At 0,0, full size, shown for `delay` ms; bit 1 = do not blend,
          // since every frame is already the whole composited picture.
          Uint8Array.from([...u24(0), ...u24(0), ...u24(width - 1), ...u24(height - 1), ...u24(frame.delay), 0b10]),
          data,
        ]),
      ),
    );
    onFrame(++done, total);
  }

  const vp8x = chunk('VP8X', [(alpha ? 0x10 : 0) | 0x02, 0, 0, 0, ...u24(width - 1), ...u24(height - 1)]);
  // A GIF with no loop extension plays once; WebP's 0 means forever.
  const loops = loop === null ? 1 : loop;
  const anim = chunk('ANIM', [0, 0, 0, 0, loops & 255, (loops >> 8) & 255]);
  const body = concat([Uint8Array.from(ascii('WEBP')), vp8x, anim, ...frames]);
  const riff = new Uint8Array(8);
  riff.set(ascii('RIFF'), 0);
  new DataView(riff.buffer).setUint32(4, body.length, true);
  return concat([riff, body]);
}
