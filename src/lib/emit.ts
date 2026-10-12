import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Row } from './optimize';

/**
 * Output assembly. Law 4: originals are never touched - everything lands in a new
 * zip the user chooses to download.
 *
 * The zip mirrors the input folder structure and carries a `snippets.html` with
 * every generated `<picture>` block and `@font-face` rule. ADR-004: for a
 * WordPress or PHP developer the markup is the deliverable; the files are just
 * what it points at.
 */

const enc = new TextEncoder();

export function snippetsDocument(rows: Row[]): string {
  const blocks = rows
    .filter((r) => r.snippet)
    .map((r) => '<!-- ' + r.asset.path + ' -->\n' + r.snippet);

  const skipped = rows
    .map((r) => {
      const reason = r.outcome?.skipped ?? r.font?.skipped ?? r.text?.skipped;
      return reason ? '  ' + r.asset.path + ' - ' + reason : undefined;
    })
    .filter((line): line is string => line !== undefined);

  const warnings = rows.flatMap((r) =>
    [...(r.outcome?.warnings ?? []), ...(r.font?.warnings ?? []), ...(r.text?.warnings ?? [])].map(
      (w) => '  ' + r.asset.path + ' - ' + w,
    ),
  );

  const hasCompressed = rows.some((r) => (r.text?.siblings.length ?? 0) > 0);

  const parts = [
    'Pare - generated markup',
    '',
    'Paste these blocks where the original tags were. Keep the files in the same',
    'folders they came out in, or edit the paths to match where you upload them.',
    '',
    '='.repeat(72),
    '',
    ...blocks.map((b) => b + '\n'),
  ];

  if (hasCompressed) {
    parts.push(
      '',
      'About the .gz and .br files:',
      '  These are pre-compressed copies. A server sends them instead of the',
      '  original when a browser says it accepts them. If your host does not know',
      '  how to serve them, you can delete them - the uncompressed files work on',
      '  their own.',
    );
  }

  if (skipped.length > 0) parts.push('', 'Files left unchanged:', ...skipped);
  if (warnings.length > 0) parts.push('', 'Notes:', ...warnings);

  return parts.join('\n') + '\n';
}

export function buildZip(rows: Row[]): Blob {
  return zipToBlob(outputFiles(rows));
}

/** Formats that are already compressed; deflating them again only costs time. */
const STORED = /\.(jpe?g|png|gif|webp|avif|heic|woff2?|gz|br|zip|mp4|webm)$/i;

/**
 * A zip built in chunks, straight into a Blob. Two things matter at scale
 * (docs/SCALING.md): there is never one archive-sized buffer in memory - a
 * single ArrayBuffer tops out around 2 GB, and a big uploads folder is past
 * that - and images and fonts, already compressed, are stored rather than
 * deflated a second time for nothing.
 */
export function zipToBlob(files: Record<string, Uint8Array>): Blob {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  for (const [path, bytes] of Object.entries(files)) {
    const entry = STORED.test(path) ? new ZipPassThrough(path) : new ZipDeflate(path, { level: 6 });
    zip.add(entry);
    entry.push(bytes, true);
  }
  zip.end();
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

/** Every output file by path: what goes in the zip, or into a chosen folder. */
export function outputFiles(rows: Row[]): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  for (const row of rows) {
    const image = row.outcome;
    if (image && image.variants.length > 0) {
      for (const v of image.variants) files[v.path] = v.bytes;
      continue;
    }

    const font = row.font;
    if (font && font.slices.length > 0) {
      for (const s of font.slices) {
        files[s.path] = s.bytes;
        if (s.woff) files[s.woff.path] = s.woff.bytes;
      }
      continue;
    }

    const text = row.text;
    if (text) {
      // The minified file keeps the original name so it drops straight in.
      files[text.inputPath] = text.minified;
      if (text.map) files[text.map.path] = text.map.bytes;
      for (const s of text.siblings) files[s.path] = s.bytes;
      continue;
    }

    // No pipeline for this one, or nothing could be done with it: copy it through.
    files[row.asset.path] = row.asset.bytes;
  }

  if (rows.some((r) => r.snippet)) {
    files['snippets.html'] = enc.encode(snippetsDocument(rows));
  }

  return files;
}

export function download(data: Uint8Array | Blob, filename: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BufferSource], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
