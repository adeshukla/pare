/**
 * Output file names. Directory structure from the input is preserved so a
 * dropped folder comes back with the same shape.
 *
 * Phase 1 does not content-hash. Hashing implies rewriting references, and
 * rewriting is gated on the resolvability graph that lands in Phase 4 (Law 3).
 */

export const EXT_FOR_MIME: Record<string, string> = {
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

export function splitPath(path: string): { dir: string; stem: string; ext: string } {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash);
  const file = slash === -1 ? path : path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return {
    dir,
    stem: dot <= 0 ? file : file.slice(0, dot),
    ext: dot <= 0 ? '' : file.slice(dot + 1).toLowerCase(),
  };
}

/** `img/hero.jpg` at 800px as AVIF becomes `img/hero-800.avif`. */
export function variantPath(sourcePath: string, width: number, mime: string): string {
  const { dir, stem } = splitPath(sourcePath);
  const ext = EXT_FOR_MIME[mime] ?? 'bin';
  const file = `${stem}-${width}.${ext}`;
  return dir ? `${dir}/${file}` : file;
}
