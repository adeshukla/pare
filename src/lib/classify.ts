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

/**
 * The brands an ISO-BMFF file declares: its major brand and every compatible
 * one. AVIF and HEIC share the container and often the generic 'mif1' major
 * brand, so telling them apart means reading the whole list.
 */
function brands(b: Uint8Array): string[] {
  if (!ascii(b, 4, 'ftyp')) return [];
  const size = ((at(b, 0) << 24) | (at(b, 1) << 16) | (at(b, 2) << 8) | at(b, 3)) >>> 0;
  const end = Math.min(size, b.length, 256);
  const out: string[] = [];
  const read = (i: number) => String.fromCharCode(at(b, i), at(b, i + 1), at(b, i + 2), at(b, i + 3));
  out.push(read(8));
  for (let i = 16; i + 4 <= end; i += 4) out.push(read(i));
  return out;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const isAvif = (b: Uint8Array) => brands(b).some((x) => x === 'avif' || x === 'avis');
const isHeic = (b: Uint8Array) => !isAvif(b) && brands(b).some((x) => HEIC_BRANDS.has(x));

/** 'BM', then a DIB header size that a real BMP uses. Two letters alone are too weak. */
const isBmp = (b: Uint8Array) =>
  ascii(b, 0, 'BM') && [12, 40, 52, 56, 64, 108, 124].includes(at(b, 14) | (at(b, 15) << 8));

const SIGNATURES: Sig[] = [
  { kind: 'image', mime: 'image/jpeg', test: (b) => at(b, 0) === 0xff && at(b, 1) === 0xd8 && at(b, 2) === 0xff },
  { kind: 'image', mime: 'image/png', test: (b) => at(b, 0) === 0x89 && ascii(b, 1, 'PNG') },
  { kind: 'image', mime: 'image/gif', test: (b) => ascii(b, 0, 'GIF8') },
  { kind: 'image', mime: 'image/webp', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { kind: 'image', mime: 'image/avif', test: isAvif },
  { kind: 'image', mime: 'image/heic', test: isHeic },
  { kind: 'image', mime: 'image/bmp', test: isBmp },
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

/**
 * Server-side templates. Pare never rewrites or minifies these - they mix markup
 * with code that runs before any browser sees the page - but it reads them, so
 * that nothing they mention is ever renamed. ADR-027.
 */
const TEMPLATE_EXT = new Set([
  'php', 'phtml', 'twig', 'blade', 'liquid', 'erb', 'njk', 'nunjucks', 'hbs', 'handlebars',
  'mustache', 'tpl', 'ejs', 'jinja', 'jinja2', 'j2', 'latte', 'cshtml', 'aspx', 'jsp', 'gohtml',
]);

export function classify(path: string, bytes: Uint8Array): { kind: AssetKind; mime: string } {
  for (const sig of SIGNATURES) {
    if (sig.test(bytes)) return { kind: sig.kind, mime: sig.mime };
  }
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (TEMPLATE_EXT.has(ext)) return { kind: 'template', mime: 'text/plain' };
  return BY_EXT[ext] ?? { kind: 'other', mime: 'application/octet-stream' };
}
