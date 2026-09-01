import { splitPath } from './naming';

/**
 * Content hashing for cache busting.
 *
 * A hash only ever goes on a file every reference to which could be resolved
 * statically - Law 3 - so this module is deliberately dumb about policy. It
 * computes a digest and builds a name; graph.ts decides who is allowed one.
 */

/** Eight hex characters. Collision risk across one site's assets is negligible. */
const LENGTH = 8;

export async function contentHash(bytes: Uint8Array): Promise<string> {
  const view = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', view);
  return [...new Uint8Array(digest)]
    .slice(0, LENGTH / 2)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `img/hero.jpg` with hash `a1b2c3d4` becomes `img/hero.a1b2c3d4.jpg`. */
export function hashedPath(path: string, hash: string): string {
  const { dir, stem, ext } = splitPath(path);
  const file = ext ? `${stem}.${hash}.${ext}` : `${stem}.${hash}`;
  return dir ? `${dir}/${file}` : file;
}

/**
 * Swap the filename in a reference while leaving its shape alone.
 *
 * The shape matters. `../img/hero.jpg` and `/img/hero.jpg` resolve to the same
 * file from different places, and rewriting one into the other would work until
 * the page moved. Only the last segment changes; the prefix, the query and the
 * fragment are carried through untouched.
 */
export function replaceBasename(raw: string, newBasename: string): string {
  const suffixAt = raw.search(/[?#]/);
  const pathPart = suffixAt === -1 ? raw : raw.slice(0, suffixAt);
  const suffix = suffixAt === -1 ? '' : raw.slice(suffixAt);
  const slash = pathPart.lastIndexOf('/');
  const dir = slash === -1 ? '' : pathPart.slice(0, slash + 1);
  return dir + newBasename + suffix;
}

export const basenameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
