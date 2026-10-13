/**
 * Paste-ready markup. ADR-004: this is a first-class deliverable, not a details
 * panel. The target user cannot use a `dist/` folder — they can use this.
 *
 * Pure string building, no DOM, so it is testable in isolation.
 */

import type { OutputFormat } from './settings';

export type Variant = {
  format: OutputFormat;
  mime: string;
  width: number;
  path: string;
  bytes: number;
};

export type SnippetInput = {
  sourcePath: string;
  variants: Variant[];
  /** Intrinsic size of the source, used for width/height to stop layout shift. */
  naturalWidth: number;
  naturalHeight: number;
  imgSrc: string;
  sizes: string;
  lazy: boolean;
  alt: string;
  /** ThumbHash as a data URI, painted behind the image while it loads. */
  placeholder?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `hero-400.avif 400w, hero-800.avif 800w` */
export function srcset(variants: Variant[]): string {
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map((v) => `${esc(v.path)} ${v.width}w`)
    .join(', ');
}

/** Source order matters: the browser takes the first type it can decode. */
const ORDER: OutputFormat[] = ['avif', 'webp'];

export function pictureSnippet(input: SnippetInput): string {
  const { variants, naturalWidth, naturalHeight, sizes, lazy, alt, placeholder } = input;
  if (variants.length === 0) return '';

  const lines: string[] = [];
  const formats = new Set(variants.map((v) => v.format));
  const widths = new Set(variants.map((v) => v.width)).size;
  // One width: a plain address, no "800w" and no sizes - there is nothing for
  // the browser to choose between.
  const single = widths === 1;
  const sources = ORDER.map((format) => variants.filter((v) => v.format === format)).filter(
    (group) => group.length > 0,
  );
  // One format means nothing for <picture> to choose between: a plain <img>.
  const wrap = sources.length > 0 && formats.size > 1;
  const indent = wrap ? '  ' : '';
  lines.push(`<!-- ${esc(input.sourcePath)} → ${widths} width${widths === 1 ? '' : 's'} × ${formats.size} format${formats.size === 1 ? '' : 's'} -->`);
  if (wrap) lines.push('<picture>');

  for (const group of wrap ? sources : []) {
    lines.push(
      single
        ? `  <source type="${esc(group[0]!.mime)}" srcset="${esc(group[0]!.path)}">`
        : `  <source type="${esc(group[0]!.mime)}" srcset="${srcset(group)}" sizes="${esc(sizes)}">`,
    );
  }

  // Without a wrapper, the <img> carries every width of its one format.
  const fallback = wrap ? variants.filter((v) => v.format === 'fallback') : variants;
  const attrs = [
    `src="${esc(input.imgSrc)}"`,
    fallback.length > 1 ? `srcset="${srcset(fallback)}"` : '',
    fallback.length > 1 ? `sizes="${esc(sizes)}"` : '',
    `width="${naturalWidth}"`,
    `height="${naturalHeight}"`,
    `alt="${esc(alt)}"`,
    lazy ? 'loading="lazy"' : '',
    lazy ? 'decoding="async"' : '',
    placeholder
      ? `style="background-image:url(${esc(placeholder)});background-size:cover"`
      : '',
  ].filter(Boolean);

  lines.push(`${indent}<img ${attrs.join(' ')}>`);
  if (wrap) lines.push('</picture>');
  return lines.join('\n');
}
