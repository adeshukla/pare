/**
 * A positional scanner for HTML attributes and raw-text elements.
 *
 * Why not just use DOMParser and re-serialize? Because serializing a parsed
 * document rewrites the whole file: it normalises attribute quoting and casing,
 * moves stray elements into `<body>`, closes tags the author left open, drops the
 * doctype's internal subset, and re-encodes entities. Every one of those is a
 * change to a file the user did not ask us to touch, and some of them - moving an
 * element out of `<head>`, for instance - change what renders.
 *
 * So DOMParser is still used to *understand* a page (see graph.ts). Rewriting
 * happens here instead: find the exact byte range of the attribute value, splice
 * the new value in, and leave every other byte of the file alone. A rewritten
 * page differs from its original only at the addresses that changed.
 *
 * See ADR-015.
 */

export type AttrHit = {
  /** Lowercased tag name. */
  tag: string;
  /** Lowercased attribute name. */
  attr: string;
  /** Value exactly as written, entities and all. */
  value: string;
  /** Byte range of the value, excluding the quotes. */
  start: number;
  end: number;
  quote: '"' | "'" | '';
  /** Byte range of the whole element's open tag, for context. */
  tagStart: number;
};

export type RawText = {
  tag: 'style' | 'script';
  /** Byte range of the element's text content. */
  start: number;
  end: number;
  text: string;
  /** Attributes on the opening tag, so callers can read `type` or `src`. */
  attrs: Record<string, string>;
};

/** One `<img>` open tag, whole, for callers that wrap rather than splice a value. */
export type ImgTag = {
  /** Byte range of the open tag, `<` through `>`. */
  start: number;
  end: number;
  /** Lowercased attribute names to values exactly as written. */
  attrs: Record<string, string>;
  /** Already the child of a `<picture>` the author wrote. */
  inPicture: boolean;
};

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isNameChar = (c: string) => !isSpace(c) && c !== '=' && c !== '>' && c !== '/' && c !== '<';

type Scan = { attrs: AttrHit[]; raw: RawText[]; imgs: ImgTag[] };

function scan(html: string): Scan {
  const attrs: AttrHit[] = [];
  const raw: RawText[] = [];
  const imgs: ImgTag[] = [];
  let pictureDepth = 0;
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    // Comments, doctype and processing instructions carry nothing we rewrite.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const end = html.indexOf('>', lt);
      if (/^<\/picture[\s>]/i.test(html.slice(lt, lt + 10)) && pictureDepth > 0) pictureDepth--;
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    // Read the tag name.
    let p = lt + 1;
    let name = '';
    while (p < html.length && isNameChar(html[p]!)) name += html[p++]!;
    if (name === '') {
      i = lt + 1;
      continue;
    }
    const tag = name.toLowerCase();
    const tagAttrs: Record<string, string> = {};

    // Read attributes until the tag closes.
    for (;;) {
      while (p < html.length && isSpace(html[p]!)) p++;
      if (p >= html.length) break;

      const c = html[p]!;
      if (c === '>') {
        p++;
        break;
      }
      if (c === '/' && html[p + 1] === '>') {
        p += 2;
        break;
      }
      if (c === '<') break; // malformed; bail out of this tag

      let attr = '';
      while (p < html.length && isNameChar(html[p]!)) attr += html[p++]!;
      if (attr === '') {
        p++;
        continue;
      }

      while (p < html.length && isSpace(html[p]!)) p++;
      if (html[p] !== '=') {
        tagAttrs[attr.toLowerCase()] = '';
        continue; // valueless attribute
      }
      p++;
      while (p < html.length && isSpace(html[p]!)) p++;

      const quoteChar = html[p];
      let start: number;
      let end: number;
      let quote: AttrHit['quote'];

      if (quoteChar === '"' || quoteChar === "'") {
        quote = quoteChar;
        start = p + 1;
        end = html.indexOf(quoteChar, start);
        if (end === -1) {
          p = html.length;
          break;
        }
        p = end + 1;
      } else {
        quote = '';
        start = p;
        while (p < html.length && !isSpace(html[p]!) && html[p] !== '>') p++;
        end = p;
      }

      const value = html.slice(start, end);
      tagAttrs[attr.toLowerCase()] = value;
      attrs.push({ tag, attr: attr.toLowerCase(), value, start, end, quote, tagStart: lt });
    }

    if (tag === 'picture') pictureDepth++;
    if (tag === 'img' && html[p - 1] === '>') {
      imgs.push({ start: lt, end: p, attrs: tagAttrs, inPicture: pictureDepth > 0 });
    }

    // Raw-text elements swallow everything up to their closing tag, so the
    // scanner must skip the body rather than try to read tags inside it.
    if (RAW_TEXT.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = html.slice(p);
      const match = close.exec(rest);
      const bodyEnd = match ? p + match.index : html.length;
      if (tag === 'style' || tag === 'script') {
        raw.push({ tag, start: p, end: bodyEnd, text: html.slice(p, bodyEnd), attrs: tagAttrs });
      }
      i = match ? p + match.index + match[0].length : html.length;
      continue;
    }

    i = p;
  }

  return { attrs, raw, imgs };
}

export function scanAttributes(html: string): AttrHit[] {
  return scan(html).attrs;
}

export function scanRawText(html: string): RawText[] {
  return scan(html).raw;
}

export function scanHtml(html: string): Scan {
  return scan(html);
}

/* ------------------------------------------------------------------ *
 * Entities
 * ------------------------------------------------------------------ */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
};

/** Enough to read an attribute value that holds a path. Not a full HTML parser. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    const named = NAMED[body] ?? NAMED[body.toLowerCase()];
    if (named) return named;
    if (body.startsWith('#')) {
      const code = body.startsWith('#x') || body.startsWith('#X')
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
    }
    return whole;
  });
}

/** Re-encode for insertion into an attribute delimited by `quote`. */
export function encodeAttrValue(value: string, quote: AttrHit['quote']): string {
  const escaped = value.replace(/&/g, '&amp;');
  if (quote === '"') return escaped.replace(/"/g, '&quot;');
  if (quote === "'") return escaped.replace(/'/g, '&#39;');
  // An unquoted value cannot contain whitespace or any of these.
  return escaped.replace(/["'`=<>\s]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Apply edits to a source string. Edits are byte ranges with replacements; they
 * are applied back to front so earlier offsets stay valid.
 */
export type Edit = { start: number; end: number; text: string };

export function applyEdits(source: string, edits: Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = source;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const edit of ordered) {
    // Overlapping edits would corrupt the file; drop the later one rather than
    // produce something subtly wrong.
    if (edit.end > lastStart) continue;
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    lastStart = edit.start;
  }
  return out;
}
