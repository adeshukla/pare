/**
 * Law 3 lives here.
 *
 *   "If a reference to an asset cannot be fully resolved statically, that asset
 *    is not hashed and not renamed. Emit a warning, leave it alone."
 *
 * Everything in Phase 4 that can break a page flows through this one decision, so
 * the bias is heavily towards saying "no". A reference we wrongly call resolvable
 * becomes a renamed file and a 404; a reference we wrongly call unresolvable
 * costs a few bytes of cache-busting. Those are not the same mistake.
 */

export type RefKind =
  | 'internal' // points at a file in the folder we were given
  | 'external' // another origin, or protocol-relative
  | 'inline' // data: or blob:
  | 'anchor' // #fragment only
  | 'special' // mailto:, tel:, javascript:, etc.
  | 'templated' // contains server or client template syntax
  | 'empty';

export type ClassifiedRef = {
  kind: RefKind;
  /** Folder-relative path, present only for a resolvable internal reference. */
  target?: string;
  resolvable: boolean;
  /** Why it cannot be rewritten, in words a non-technical reader can act on. */
  reason?: string;
};

/**
 * Server and client templating. A path assembled at request time cannot be known
 * from the files on disk - this is the same wall that keeps CSS purging out of
 * scope (ADR-002), met again in a narrower place.
 */
const TEMPLATE_PATTERNS: Array<[RegExp, string]> = [
  [/<\?(php|=)/i, 'PHP'],
  [/\{\{|\}\}/, 'a template placeholder'],
  [/\{%|%\}/, 'a template tag'],
  [/<%|%>/, 'a template tag'],
  [/\$\{/, 'a JavaScript template literal'],
  [/\$[A-Za-z_]/, 'a variable'],
  [/\[\[|\]\]/, 'a template placeholder'],
];

export function looksTemplated(raw: string): string | undefined {
  for (const [pattern, label] of TEMPLATE_PATTERNS) {
    if (pattern.test(raw)) return label;
  }
  return undefined;
}

/** Resolve a folder-relative reference against the file that contains it. */
export function resolveAgainst(fromPath: string, reference: string): string | undefined {
  const base = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const combined = reference.startsWith('/')
    ? reference.slice(1)
    : base
      ? `${base}/${reference}`
      : reference;

  const out: string[] = [];
  for (const segment of combined.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // Climbing above the folder we were handed means the file is not ours.
      if (out.length === 0) return undefined;
      out.pop();
      continue;
    }
    out.push(segment);
  }

  return out.length > 0 ? out.join('/') : undefined;
}

/**
 * Classify one raw reference. `fromPath` is the file it appears in, so relative
 * paths can be resolved; `exists` answers whether a folder-relative path is a
 * file we actually received.
 */
export function classifyRef(
  raw: string,
  fromPath: string,
  exists: (path: string) => boolean,
): ClassifiedRef {
  const value = raw.trim();

  if (value === '') return { kind: 'empty', resolvable: false, reason: 'the reference is empty' };

  const templated = looksTemplated(value);
  if (templated) {
    return {
      kind: 'templated',
      resolvable: false,
      reason: `the address is built by ${templated}, so its final value is not in these files`,
    };
  }

  if (value.startsWith('#')) return { kind: 'anchor', resolvable: false };
  if (/^(data|blob):/i.test(value)) return { kind: 'inline', resolvable: false };
  if (/^(mailto|tel|sms|javascript):/i.test(value)) return { kind: 'special', resolvable: false };

  // Protocol-relative (//cdn...) and absolute URLs both leave the folder.
  if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return { kind: 'external', resolvable: false };
  }

  // A query or fragment on a local path is fine; strip it before resolving, and
  // put it back when rewriting.
  const withoutSuffix = value.split(/[?#]/)[0] ?? '';
  if (withoutSuffix === '') return { kind: 'anchor', resolvable: false };

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    // A malformed escape means we cannot know what file is meant.
    return {
      kind: 'internal',
      resolvable: false,
      reason: 'the address contains an escape sequence that could not be read',
    };
  }

  const target = resolveAgainst(fromPath, decoded);
  if (!target) {
    return {
      kind: 'internal',
      resolvable: false,
      reason: 'the address points outside the folder you dropped in',
    };
  }

  if (!exists(target)) {
    return {
      kind: 'internal',
      target,
      resolvable: false,
      reason: `no file named ${target} was in the folder you dropped in`,
    };
  }

  return { kind: 'internal', target, resolvable: true };
}

/**
 * `srcset` is not a plain comma-separated list, and splitting it like one
 * corrupts any URL containing a comma - which is legal, as long as the URL does
 * not *end* with one. This follows the HTML spec's actual algorithm: take a run
 * of non-whitespace as the URL, then read the descriptor up to the next
 * top-level comma.
 */
export function parseSrcset(value: string): Array<{ url: string; descriptor: string }> {
  const out: Array<{ url: string; descriptor: string }> = [];
  const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
  let i = 0;

  while (i < value.length) {
    while (i < value.length && (isSpace(value[i]) || value[i] === ',')) i++;
    if (i >= value.length) break;

    const urlStart = i;
    while (i < value.length && !isSpace(value[i])) i++;
    let url = value.slice(urlStart, i);
    let descriptor = '';

    if (url.endsWith(',')) {
      // A trailing comma ends the candidate: there is no descriptor.
      url = url.replace(/,+$/, '');
    } else {
      while (i < value.length && isSpace(value[i])) i++;
      const descStart = i;
      let depth = 0;
      while (i < value.length) {
        const c = value[i]!;
        if (c === '(') depth++;
        else if (c === ')') depth = Math.max(0, depth - 1);
        else if (c === ',' && depth === 0) break;
        i++;
      }
      descriptor = value.slice(descStart, i).trim();
      if (value[i] === ',') i++;
    }

    if (url) out.push({ url, descriptor });
  }

  return out;
}

/** Rebuild a srcset value from candidates, preserving descriptors. */
export function formatSrcset(candidates: Array<{ url: string; descriptor: string }>): string {
  return candidates
    .map(({ url, descriptor }) => (descriptor ? `${url} ${descriptor}` : url))
    .join(', ');
}
