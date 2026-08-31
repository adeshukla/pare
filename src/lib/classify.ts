import type { AssetKind } from './types';

/**
 * Classify by magic bytes first, extension second.
 * A .jpg that is actually a PNG is common in the wild; trusting the extension
 * hands the wrong decoder a file and produces a confusing failure.
 */

type Sig = { kind: AssetKind; mime: string; test: (b: Uint8Array) => boolean };

const at = (b: Uint8Array, i: number) => b[i] ?? -1;
const ascii = (b: Uint8Array, off: number, s: string) =>
  [...s].every((c, i) => at(b, off + i) === c.charCodeAt(0));

const SIGNATURES: Sig[] = [
  { kind: 'image', mime: 'image/jpeg', test: (b) => at(b, 0) === 0xff && at(b, 1) === 0xd8 && at(b, 2) === 0xff },
  { kind: 'image', mime: 'image/png', test: (b) => at(b, 0) === 0x89 && ascii(b, 1, 'PNG') },
  { kind: 'image', mime: 'image/gif', test: (b) => ascii(b, 0, 'GIF8') },
  { kind: 'image', mime: 'image/webp', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { kind: 'image', mime: 'image/avif', test: (b) => ascii(b, 4, 'ftyp') && (ascii(b, 8, 'avif') || ascii(b, 8, 'avis')) },
  { kind: 'font', mime: 'font/woff2', test: (b) => ascii(b, 0, 'wOF2') },
  { kind: 'font', mime: 'font/woff', test: (b) => ascii(b, 0, 'wOFF') },
  { kind: 'font', mime: 'font/otf', test: (b) => ascii(b, 0, 'OTTO') },
  { kind: 'font', mime: 'font/ttf', test: (b) => at(b, 0) === 0x00 && at(b, 1) === 0x01 && at(b, 2) === 0x00 && at(b, 3) === 0x00 },
];

const BY_EXT: Record<string, { kind: AssetKind; mime: string }> = {
  svg: { kind: 'svg', mime: 'image/svg+xml' },
  css: { kind: 'css', mime: 'text/css' },
  js: { kind: 'js', mime: 'text/javascript' },
  mjs: { kind: 'js', mime: 'text/javascript' },
  html: { kind: 'html', mime: 'text/html' },
  htm: { kind: 'html', mime: 'text/html' },
};

export function classify(path: string, bytes: Uint8Array): { kind: AssetKind; mime: string } {
  for (const sig of SIGNATURES) {
    if (sig.test(bytes)) return { kind: sig.kind, mime: sig.mime };
  }
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? { kind: 'other', mime: 'application/octet-stream' };
}
