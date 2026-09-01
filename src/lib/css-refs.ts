/**
 * Finding `url()` and `@import` in a stylesheet, with byte positions.
 *
 * Same reasoning as html-scan.ts: Lightning CSS could parse and re-emit this, but
 * re-emitting rewrites the whole file. Rewriting a reference should change the
 * reference and nothing else, so this finds the exact range of each address and
 * leaves the rest of the stylesheet untouched.
 *
 * It is a scanner, not a parser. It understands strings and comments well enough
 * not to be fooled by a `url(` inside either, which is all that is needed to
 * locate addresses.
 */

export type CssRef = {
  /** The address as written, without quotes. */
  value: string;
  /** Byte range of the address, excluding any quotes. */
  start: number;
  end: number;
  quote: '"' | "'" | '';
  source: 'url' | 'import';
};

export function findCssRefs(css: string): CssRef[] {
  const refs: CssRef[] = [];
  let i = 0;

  while (i < css.length) {
    const c = css[i]!;

    // Skip comments.
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }

    // Skip strings that are not part of a url() or @import.
    if (c === '"' || c === "'") {
      i = skipString(css, i);
      continue;
    }

    if ((c === 'u' || c === 'U') && /^url\(/i.test(css.slice(i, i + 4))) {
      const found = readUrlToken(css, i + 4);
      if (found) {
        refs.push({ ...found.ref, source: 'url' });
        i = found.next;
        continue;
      }
    }

    if (c === '@' && /^@import\b/i.test(css.slice(i, i + 8))) {
      const found = readImportTarget(css, i + 7);
      if (found) {
        refs.push({ ...found.ref, source: 'import' });
        i = found.next;
        continue;
      }
    }

    i++;
  }

  return refs;
}

function skipString(css: string, start: number): number {
  const quote = css[start]!;
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += 2;
      continue;
    }
    if (css[i] === quote) return i + 1;
    // An unterminated string ends at the newline, per the CSS spec.
    if (css[i] === '\n') return i + 1;
    i++;
  }
  return css.length;
}

/** Read the contents of `url( ... )`, which may be quoted or bare. */
function readUrlToken(css: string, from: number): { ref: Omit<CssRef, 'source'>; next: number } | undefined {
  let i = from;
  while (i < css.length && /\s/.test(css[i]!)) i++;

  const c = css[i];
  if (c === '"' || c === "'") {
    const start = i + 1;
    let j = start;
    while (j < css.length && css[j] !== c) {
      if (css[j] === '\\') j++;
      if (css[j] === '\n') break;
      j++;
    }
    if (css[j] !== c) return undefined;
    const close = css.indexOf(')', j);
    return {
      ref: { value: css.slice(start, j), start, end: j, quote: c },
      next: close === -1 ? j + 1 : close + 1,
    };
  }

  // Bare url(path) - runs to the closing paren, trailing space trimmed.
  const close = css.indexOf(')', i);
  if (close === -1) return undefined;
  let end = close;
  while (end > i && /\s/.test(css[end - 1]!)) end--;
  if (end === i) return undefined;

  return { ref: { value: css.slice(i, end), start: i, end, quote: '' }, next: close + 1 };
}

/** `@import "a.css"` and `@import url("a.css")` both point at a file. */
function readImportTarget(
  css: string,
  from: number,
): { ref: Omit<CssRef, 'source'>; next: number } | undefined {
  let i = from;
  while (i < css.length && /\s/.test(css[i]!)) i++;

  if (/^url\(/i.test(css.slice(i, i + 4))) {
    // Let the url() branch handle it on the next pass.
    return undefined;
  }

  const c = css[i];
  if (c !== '"' && c !== "'") return undefined;

  const start = i + 1;
  let j = start;
  while (j < css.length && css[j] !== c) {
    if (css[j] === '\\') j++;
    if (css[j] === '\n') break;
    j++;
  }
  if (css[j] !== c) return undefined;

  return { ref: { value: css.slice(start, j), start, end: j, quote: c }, next: j + 1 };
}

/** Escape a path for insertion into a CSS url() or string token. */
export function encodeCssValue(value: string, quote: CssRef['quote']): string {
  if (quote === '"') return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (quote === "'") return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  // A bare url() token cannot contain whitespace, quotes or parentheses.
  return value.replace(/[\s"'()\\]/g, (c) => `\\${c}`);
}
