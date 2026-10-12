/**
 * `@font-face` and preload markup. ADR-004 again: the files are useless to this
 * audience without the CSS that points at them.
 */

export type FontFaceInput = {
  family: string;
  weight: number;
  italic: boolean;
  /** One entry per emitted file: the path plus the range it serves. */
  slices: Array<{ path: string; unicodeRange: string; name: string; woffPath?: string }>;
  display: string;
  /** Emit a `<link rel=preload>` for the first slice. */
  preload: boolean;
};

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function fontFaceSnippet(input: FontFaceInput): string {
  if (input.slices.length === 0) return '';
  const lines: string[] = [];

  if (input.preload) {
    // Only the first slice is preloaded. Preloading every range would download
    // the scripts the visitor does not read, which is the opposite of the point.
    const first = input.slices[0]!;
    lines.push(
      `<!-- in <head>, before your stylesheet -->`,
      `<link rel="preload" href="${attr(first.path)}" as="font" type="font/woff2" crossorigin>`,
      '',
    );
  }

  lines.push('<style>');
  for (const slice of input.slices) {
    lines.push(
      `/* ${slice.name} */`,
      '@font-face {',
      `  font-family: ${cssString(input.family)};`,
      `  font-style: ${input.italic ? 'italic' : 'normal'};`,
      `  font-weight: ${input.weight};`,
      `  font-display: ${input.display};`,
      slice.woffPath
        ? `  src: url("${slice.path}") format("woff2"),\n       url("${slice.woffPath}") format("woff");`
        : `  src: url("${slice.path}") format("woff2");`,
    );
    if (slice.unicodeRange) lines.push(`  unicode-range: ${slice.unicodeRange};`);
    lines.push('}', '');
  }
  lines.push('</style>');

  return lines.join('\n').trimEnd();
}
