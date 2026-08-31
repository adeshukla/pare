import * as Comlink from 'comlink';

/**
 * Phase 0 worker. Reads image dimensions and computes a gzip-compressed size —
 * enough real work to prove the pool round-trips off the main thread and reports
 * progress. Phase 1 replaces this with the @jsquash codec worker.
 *
 * Codec modules are dynamically imported inside the worker so they never land in
 * the initial bundle. Keep that pattern when this file grows.
 */

export type Inspection = {
  width?: number;
  height?: number;
  /** Size after gzip. Approximates what a correctly configured server would send. */
  gzipBytes: number;
  rawBytes: number;
};

async function gzipSize(bytes: Uint8Array): Promise<number> {
  // CompressionStream is native — no dependency needed for gzip.
  if (typeof CompressionStream === 'undefined') return bytes.byteLength;
  const stream = new Blob([bytes as BufferSource])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return buf.byteLength;
}

async function dimensions(bytes: Uint8Array, mime: string) {
  if (typeof createImageBitmap === 'undefined') return {};
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BufferSource], { type: mime }));
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    // Undecodable here is not fatal — Law 5, degrade and let the caller warn.
    return {};
  }
}

const api = {
  async inspect(
    bytes: Uint8Array,
    mime: string,
    kind: string,
    onProgress: (ratio: number, label: string) => void,
  ): Promise<Inspection> {
    onProgress(0.1, 'Reading');
    const dims = kind === 'image' ? await dimensions(bytes, mime) : {};
    onProgress(0.5, 'Measuring');
    const gzipBytes = await gzipSize(bytes);
    onProgress(1, 'Done');
    return { ...dims, gzipBytes, rawBytes: bytes.byteLength };
  },
};

export type InspectApi = typeof api;

Comlink.expose(api);
