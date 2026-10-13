import { unzip, type Unzipped } from 'fflate';
import { classify } from './classify';
import type { Asset } from './types';

/**
 * Zip files as input. ADR-029.
 *
 * WordPress themes and plugins ship as zips, and so do most site exports. A zip
 * in a drop is opened and its contents take its place, at the path the zip sat
 * at - so `themes/mytheme.zip` holding `mytheme/style.css` becomes
 * `themes/mytheme/style.css`.
 *
 * Guarded the way an archive from anywhere has to be:
 *   - a cap on files and on total unpacked size, read from the archive's own
 *     directory before anything is inflated, so a "zip bomb" is refused rather
 *     than unpacked;
 *   - paths that climb out (`../`) or are absolute are dropped;
 *   - macOS metadata (`__MACOSX/`, `.DS_Store`), version control and dependency
 *     folders are skipped, as they are for a dropped folder;
 *   - a zip inside a zip is left as a file, not opened.
 *
 * A zip that cannot be read - encrypted, damaged, over the limits - is kept as
 * an ordinary file and the reason is returned, so it is copied unchanged and
 * the user is told why.
 */

export const MAX_UNZIPPED_BYTES = 2 * 1024 ** 3;

const SKIP_SEGMENTS = new Set(['__MACOSX', 'node_modules', '.git', '.svn']);

export const isZip = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** A path inside an archive made safe and relative, or undefined to skip it. */
export function safeEntryPath(name: string): string | undefined {
  const parts = name.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') return undefined;
    if (SKIP_SEGMENTS.has(part)) return undefined;
    out.push(part);
  }
  const last = out.at(-1);
  if (!last || last === '.DS_Store' || last === 'Thumbs.db' || last.startsWith('._')) return undefined;
  return out.join('/');
}

export type Unpacked = { assets: Asset[]; notes: string[] };

/**
 * Open every zip in `assets`, replacing each with what it holds. `limit` caps
 * the total number of files, matching the cap on a dropped folder.
 */
export async function expandZips(assets: Asset[], limit: number): Promise<Unpacked> {
  const notes: string[] = [];
  const out: Asset[] = [];

  for (const asset of assets) {
    if (!isZip(asset.bytes) || !/\.zip$/i.test(asset.path)) {
      out.push(asset);
      continue;
    }

    const dir = asset.path.includes('/') ? asset.path.slice(0, asset.path.lastIndexOf('/') + 1) : '';
    let declared = 0;
    let count = 0;
    let refused: string | undefined;

    let files: Unzipped;
    try {
      files = await new Promise<Unzipped>((resolve, reject) =>
        unzip(
          asset.bytes,
          {
            filter: (file) => {
              if (file.name.endsWith('/') || !safeEntryPath(file.name)) return false;
              declared += file.originalSize;
              count++;
              if (declared > MAX_UNZIPPED_BYTES) refused = 'it unpacks to more than 2 GB';
              else if (out.length + count > limit) refused = `it holds more than ${limit} files`;
              return !refused;
            },
          },
          (error, data) => (error ? reject(error) : resolve(data)),
        ),
      );
    } catch {
      out.push(asset);
      notes.push(
        `Could not open ${asset.path} - it may be password-protected or damaged - so it was kept as a file and copied unchanged.`,
      );
      continue;
    }

    if (refused) {
      out.push(asset);
      notes.push(`Did not open ${asset.path}: ${refused}. It was kept as a file and copied unchanged.`);
      continue;
    }

    for (const [name, bytes] of Object.entries(files)) {
      const path = dir + safeEntryPath(name)!;
      const { kind, mime } = classify(path, bytes);
      out.push({ path, bytes, kind, mime, refs: [], resolvable: false });
    }
    notes.push(`Opened ${asset.path}: ${Object.keys(files).length} files.`);
  }

  return { assets: out, notes };
}
