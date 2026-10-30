/**
 * A codec that could not start - most often a large WebAssembly module (esbuild
 * and Lightning CSS are 14-16 MB) refused for want of memory on a busy phone.
 * Distinct from a file the codec could not read, so that a note never blames
 * the file for the device. `lowMemory` is true only when the failure looks like
 * memory; anything else (a missing file, a blocked script) keeps its own error
 * in `cause` and is not worth waiting for.
 */
export class CodecUnavailable extends Error {
  constructor(
    message: string,
    readonly lowMemory: boolean,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

const LOW_MEMORY = /memory|allocat|out of|RangeError/i;

/**
 * Load a codec once and remember it - but not a failure: a codec that could
 * not start may start once memory frees up, so the next call tries again.
 */
export function loadOnce<T>(name: string, load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= load().catch((e: unknown) => {
      pending = undefined;
      const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
      throw new CodecUnavailable(`${name} could not start: ${text}`, LOW_MEMORY.test(text), e);
    }));
}
