/**
 * Minifying data files: JSON (including web app manifests) and XML (sitemaps,
 * RSS and Atom feeds). ADR-038.
 *
 * Both only remove whitespace that carries no data. Neither re-serializes:
 * re-printing JSON through JSON.parse would round large integers and rewrite
 * number spellings (1.0 becomes 1), which is Law 2's "never delete semantics"
 * in small print. Every other byte comes out exactly as it went in.
 */

/** JSON without whitespace outside strings, or undefined when it does not parse. */
export function minifyJson(source: string): string | undefined {
  try {
    JSON.parse(source);
  } catch {
    return undefined;
  }
  let out = '';
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (inString) {
      out += c;
      if (c === '\\') out += source[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c !== ' ' && c !== '\n' && c !== '\r' && c !== '\t' && c !== '﻿') {
      out += c;
    }
  }
  return out;
}

export type XmlResult = { code: string } | { skipped: string };

/**
 * XML without its indentation: whitespace-only text that holds a line break,
 * between two tags. Kept: whitespace inside an element that has nothing else
 * (`<a>\n</a>` - that is the element's value), anything inside comments, CDATA
 * and attribute values, and every byte of a file that asks for its whitespace
 * (`xml:space="preserve"`) or is XHTML, where a line break between inline
 * elements is a visible space.
 */
export function minifyXml(source: string): XmlResult {
  if (/xml:space\s*=\s*["']preserve["']/.test(source)) {
    return { skipped: 'It asks for its whitespace to be kept (xml:space="preserve").' };
  }
  if (source.includes('http://www.w3.org/1999/xhtml')) {
    return { skipped: 'It is XHTML, where the space between two words can be a line break between tags.' };
  }

  type Token = { kind: 'start' | 'end' | 'empty' | 'other' | 'text'; text: string; name?: string };
  const tokens: Token[] = [];
  let i = 0;
  const until = (marker: string, from: number) => {
    const at = source.indexOf(marker, from);
    if (at < 0) throw new Error('unterminated ' + marker);
    return at + marker.length;
  };

  try {
    while (i < source.length) {
      if (source[i] !== '<') {
        const next = source.indexOf('<', i);
        const end = next < 0 ? source.length : next;
        tokens.push({ kind: 'text', text: source.slice(i, end) });
        i = end;
        continue;
      }
      let end: number;
      let kind: Token['kind'] = 'other';
      let name: string | undefined;
      if (source.startsWith('<!--', i)) end = until('-->', i + 4);
      else if (source.startsWith('<![CDATA[', i)) end = until(']]>', i + 9);
      else if (source.startsWith('<?', i)) end = until('?>', i + 2);
      else if (source.startsWith('<!', i)) {
        // A DOCTYPE, possibly with an internal subset in [...].
        let depth = 0;
        end = i + 2;
        for (; end < source.length; end++) {
          const c = source[end];
          if (c === '[') depth++;
          else if (c === ']') depth--;
          else if (c === '>' && depth <= 0) break;
        }
        if (end >= source.length) throw new Error('unterminated doctype');
        end++;
      } else {
        let quote = '';
        end = i + 1;
        for (; end < source.length; end++) {
          const c = source[end]!;
          if (quote) {
            if (c === quote) quote = '';
          } else if (c === '"' || c === "'") quote = c;
          else if (c === '>') break;
        }
        if (end >= source.length) throw new Error('unterminated tag');
        end++;
        const tag = source.slice(i, end);
        name = /^<\/?\s*([^\s/>]+)/.exec(tag)?.[1];
        kind = tag.startsWith('</') ? 'end' : tag.endsWith('/>') ? 'empty' : 'start';
      }
      tokens.push({ kind, text: source.slice(i, end), name });
      i = end;
    }
  } catch {
    return { skipped: 'It could not be read as XML, so it was left exactly as it was.' };
  }

  let out = '';
  tokens.forEach((t, n) => {
    if (t.kind === 'text' && /^[ \t\r\n]*$/.test(t.text) && /[\r\n]/.test(t.text)) {
      const before = tokens[n - 1];
      const after = tokens[n + 1];
      const ownValue = before?.kind === 'start' && after?.kind === 'end' && before.name === after.name;
      if (!ownValue) return;
    }
    out += t.text;
  });
  return { code: out };
}
