/**
 * Font codecs, lazily loaded like the image ones.
 *
 * hb-subset is driven through its raw C API rather than a wrapper library. The
 * WASM module harfbuzzjs ships is standalone - zero imports - so instantiating
 * it takes no glue at all, and the seven calls below are the whole surface we
 * need. A wrapper would be more code, not less.
 */

import { loadOnce } from './once';

type HbExports = {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  hb_blob_create: (data: number, len: number, mode: number, user: number, destroy: number) => number;
  hb_blob_destroy: (blob: number) => void;
  hb_blob_get_length: (blob: number) => number;
  hb_blob_get_data: (blob: number, lengthPtr: number) => number;
  hb_face_create: (blob: number, index: number) => number;
  hb_face_destroy: (face: number) => void;
  hb_face_reference_blob: (face: number) => number;
  hb_set_add: (set: number, codepoint: number) => void;
  hb_subset_input_create_or_fail: () => number;
  hb_subset_input_destroy: (input: number) => void;
  hb_subset_input_unicode_set: (input: number) => number;
  hb_subset_or_fail: (face: number, input: number) => number;
};

/** HB_MEMORY_MODE_WRITABLE - harfbuzz may modify the buffer we handed it. */
const MEMORY_MODE_WRITABLE = 2;

/** Load the font tools now, for warmCodecs. */
export async function warmFont(kind: string): Promise<void> {
  if (kind === 'harfbuzz') await loadHarfbuzz();
  else if (kind === 'woff2') {
    await import('woff2-encoder');
    await import('woff2-encoder/decompress');
  }
}

const loadHarfbuzz = loadOnce('harfbuzz', async (): Promise<HbExports> => {
  const { default: url } = await import('harfbuzzjs/dist/harfbuzz-subset.wasm?url');
  const { instance } = await WebAssembly.instantiateStreaming(fetch(url), {});
  return instance.exports as unknown as HbExports;
});

/**
 * Keep only the given codepoints. Everything harfbuzz needs to keep the font
 * valid - layout tables, marks, composites reachable from those glyphs - it
 * works out for itself; that closure is the reason to use hb-subset rather than
 * deleting glyf entries by hand.
 */
export async function subsetFont(sfnt: Uint8Array, codepoints: Iterable<number>): Promise<Uint8Array> {
  const hb = await loadHarfbuzz();
  const heap = () => new Uint8Array(hb.memory.buffer);

  let fontPtr = 0;
  let blob = 0;
  let face = 0;
  let input = 0;
  let subsetFace = 0;
  let outBlob = 0;

  try {
    fontPtr = hb.malloc(sfnt.byteLength);
    if (!fontPtr) throw new Error('out of memory loading the font');
    heap().set(sfnt, fontPtr);

    blob = hb.hb_blob_create(fontPtr, sfnt.byteLength, MEMORY_MODE_WRITABLE, 0, 0);
    face = hb.hb_face_create(blob, 0);
    input = hb.hb_subset_input_create_or_fail();
    if (!input) throw new Error('could not start a subset');

    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const cp of codepoints) hb.hb_set_add(unicodes, cp);

    subsetFace = hb.hb_subset_or_fail(face, input);
    if (!subsetFace) throw new Error('harfbuzz refused to subset this font');

    outBlob = hb.hb_face_reference_blob(subsetFace);
    const length = hb.hb_blob_get_length(outBlob);
    const dataPtr = hb.hb_blob_get_data(outBlob, 0);
    if (!length || !dataPtr) throw new Error('the subset came back empty');

    // slice, not subarray: the copy must outlive the WASM heap.
    return heap().slice(dataPtr, dataPtr + length);
  } finally {
    if (outBlob) hb.hb_blob_destroy(outBlob);
    if (subsetFace) hb.hb_face_destroy(subsetFace);
    if (input) hb.hb_subset_input_destroy(input);
    if (face) hb.hb_face_destroy(face);
    if (blob) hb.hb_blob_destroy(blob);
    if (fontPtr) hb.free(fontPtr);
  }
}

/* ------------------------------------------------------------------ *
 * WOFF2
 * ------------------------------------------------------------------ */

/**
 * `woff2-encoder`, not `wawoff2`.
 *
 * ARCHITECTURE.md assigned wawoff2, and it is the right library in Node - the
 * probe in that environment round-tripped this exact fixture. In a browser it
 * hangs: its Emscripten wrapper resolves a promise from `onRuntimeInitialized`,
 * that callback never fires under Vite's CommonJS interop, and `compress` waits
 * on it forever. A hang is worse than a crash, because Law 5's "skip and warn"
 * never gets a chance to run.
 *
 * `woff2-encoder` is the same Google WOFF2 codec compiled as ESM with a promise
 * API, no CommonJS interop in the way. See ADR-014.
 */

export async function toWoff2(sfnt: Uint8Array): Promise<Uint8Array> {
  const { compress } = await import('woff2-encoder');
  return new Uint8Array(await compress(sfnt));
}

export async function fromWoff2(woff2: Uint8Array): Promise<Uint8Array> {
  const { default: decompress } = await import('woff2-encoder/decompress');
  return new Uint8Array(await decompress(woff2));
}
