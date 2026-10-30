/**
 * A codec that could not start - most often a large WebAssembly module (esbuild
 * and Lightning CSS are 14-16 MB) refused for want of memory on a busy phone.
 * Distinct from a file the codec could not read, so that a note never blames
 * the file for the device.
 */
export class CodecUnavailable extends Error {}

/**
 * Load a codec once and remember it - but not a failure: a codec that could
 * not start may start once memory frees up, so the next call tries again.
 */
export function loadOnce<T>(name: string, load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= load().catch((e: unknown) => {
      pending = undefined;
      throw new CodecUnavailable(`${name} could not start: ${e instanceof Error ? e.message : String(e)}`);
    }));
}
