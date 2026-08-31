import { zipSync } from 'fflate';
import type { Row } from './optimize';

/**
 * Output assembly. Law 4: originals are never touched - everything lands in a new
 * zip the user chooses to download.
 *
 * The zip mirrors the input folder structure, and carries a `snippets.html` with
 * every generated `<picture>` block. ADR-004: for a WordPress or PHP developer the
 * markup is the deliverable; the files are just what it points at.
 */

const enc = new TextEncoder();

export function snippetsDocument(rows: Row[]): string {
  const blocks = rows
    .filter((r) => r.snippet)
    .map((r) => '<!-- ' + r.asset.path + ' -->\n' + r.snippet);

  const skipped = rows
    .filter((r) => r.outcome?.skipped)
    .map((r) => '  ' + r.asset.path + ' - ' + r.outcome!.skipped);

  const warnings = rows.flatMap((r) =>
    (r.outcome?.warnings ?? []).map((w) => '  ' + r.asset.path + ' - ' + w),
  );

  const parts = [
    'Pare - generated markup',
    '',
    'Paste these blocks where the original <img> tags were. Keep the files in the',
    'same folders they came out in, or edit the paths to match where you upload them.',
    '',
    '='.repeat(72),
    '',
    ...blocks.map((b) => b + '\n'),
  ];

  if (skipped.length > 0) parts.push('', 'Files left unchanged:', ...skipped);
  if (warnings.length > 0) parts.push('', 'Notes:', ...warnings);

  return parts.join('\n') + '\n';
}

export function buildZip(rows: Row[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  for (const row of rows) {
    const outcome = row.outcome;
    if (outcome && outcome.variants.length > 0) {
      for (const v of outcome.variants) files[v.path] = v.bytes;
      continue;
    }
    // Not an image, or an image nothing could be done with: copy it through.
    files[row.asset.path] = row.asset.bytes;
  }

  if (rows.some((r) => r.snippet)) {
    files['snippets.html'] = enc.encode(snippetsDocument(rows));
  }

  return zipSync(files, { level: 6 });
}

export function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BufferSource], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
