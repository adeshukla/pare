import { basenameOf, replaceBasename } from './hash';
import { decodeEntities, encodeAttrValue, scanHtml, type Edit, applyEdits } from './html-scan';
import { classifyRef } from './url-ref';

/**
 * Folder mode's one structural edit: wrapping a plain `<img>` in a `<picture>`
 * so browsers that read AVIF or WebP fetch that instead. Opt-in. See ADR-021.
 *
 * Wrapping is the only thing folder mode does that is not an address swap, so it
 * is fenced on every side this file can see:
 *
 *   - CSS that selects an image by its position among its siblings or its
 *     parent (`.gallery > img`, `img + p`, `img:first-child`, `:has(> img)`)
 *     stops matching once the image has a new parent. One such selector anywhere
 *     in the site and nothing is wrapped. See `imageSensitiveSelector`.
 *   - A script that sets an image's address would be silently overruled by the
 *     `<source>` in front of it. Any page whose scripts so much as assign `.src`
 *     is left alone. See `scriptTouchesImages`.
 *   - An image that already has a `srcset`, sits in a `<picture>`, or carries a
 *     lazy-loader's `data-src` is someone else's arrangement and is left as it is.
 *
 * Whatever gets through is then rendered before and after by the verifier,
 * which compares every image's box and computed style.
 */

/** Folder-relative paths of the modern copies made for one source image. */
export type ModernCopies = { avif?: string; webp?: string };

export type WrapResult = {
  text: string;
  /** Source image paths, once per `<img>` that was wrapped. */
  wrapped: string[];
  /** Why images with modern copies were left alone, for the warning list. */
  skipped: string[];
};

const STRUCTURAL = /(?:^|[\s>+~,(])img(?![\w-])[^\s,>+~{]*:(?:first|last|nth|only)-/i;
const CHILD_OF = />\s*img(?![\w-])/i;
const SIBLING_OF = /(?:^|[\s>+~,(])img(?![\w-])[^\s,>+~{]*\s*[+~]/i;
const HAS_IMG = /:has\([^)]*(?:^|[\s>+~,(])img(?![\w-])/i;
/** Styles already written for `picture` would land on every new wrapper. */
const PICTURE = /(?:^|[\s>+~,(])(?:picture|source)(?![\w-])/i;

/**
 * The first selector in `css` that would stop matching, or start matching
 * something else, once an `<img>` gains a `<picture>` parent. Undefined when the
 * stylesheet does not care.
 *
 * Deliberately crude, in the safe direction: a false alarm costs one opt-in
 * feature its saving, a miss costs a layout.
 */
export function imageSensitiveSelector(css: string): string | undefined {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of stripped.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1]!.trim();
    if (prelude.startsWith('@')) continue;
    for (const selector of prelude.split(',')) {
      const s = selector.trim();
      if ([STRUCTURAL, CHILD_OF, SIBLING_OF, HAS_IMG, PICTURE].some((r) => r.test(s))) {
        return s;
      }
    }
  }
  return undefined;
}

/**
 * True when a script could change which file an image shows. A `<source>` wins
 * over the `<img src>` a script just set, so such a page must not be wrapped.
 */
export function scriptTouchesImages(js: string): boolean {
  return /\.(?:src|srcset)\s*=(?!=)|setAttribute\s*\(\s*['"`](?:src|srcset)['"`]|\.currentSrc\b/.test(
    js,
  );
}

/**
 * Why a page's scripts rule out wrapping, or undefined when they do not.
 *
 * `scriptFiles` maps folder-relative paths to the text of every script dropped
 * in. A script this page loads from anywhere else cannot be read, so it cannot
 * be cleared - Law 3's reasoning, applied to a different question.
 */
export function scriptsBlockWrapping(
  html: string,
  pagePath: string,
  scriptFiles: Map<string, string>,
  exists: (path: string) => boolean,
): string | undefined {
  const { attrs, raw } = scanHtml(html);
  const touches = 'a script on this page changes image addresses, and a <source> would overrule it';

  if (raw.some((r) => r.tag === 'script' && scriptTouchesImages(r.text))) return touches;
  if (attrs.some((a) => a.attr.startsWith('on') && scriptTouchesImages(decodeEntities(a.value)))) {
    return touches;
  }

  const tags = new Map<number, Record<string, string>>();
  for (const a of attrs) {
    if (a.tag !== 'script') continue;
    tags.set(a.tagStart, { ...tags.get(a.tagStart), [a.attr]: a.value });
  }

  for (const tag of tags.values()) {
    // A module can import anything in the folder, so every script is in play.
    if (tag.type?.trim().toLowerCase() === 'module') {
      if ([...scriptFiles.values()].some(scriptTouchesImages)) return touches;
    }
    if (tag.src === undefined) continue;
    const address = decodeEntities(tag.src).trim();
    const found = classifyRef(address, pagePath, exists);
    const source = found.target ? scriptFiles.get(found.target) : undefined;
    if (source === undefined) {
      return `this page loads ${address}, which is not in the folder, so Pare cannot tell whether it changes image addresses`;
    }
    if (scriptTouchesImages(source)) return touches;
  }

  return undefined;
}

/**
 * Wrap every eligible `<img>` in one page.
 *
 * Each edit replaces the whole open tag with `<picture>` + sources + the tag
 * exactly as written + `</picture>`. Replacing rather than inserting at two
 * points keeps adjacent images from interleaving their wrappers, and leaves
 * every byte of the original tag untouched (ADR-015).
 */
export function wrapImages(
  html: string,
  pagePath: string,
  modern: Map<string, ModernCopies>,
  exists: (path: string) => boolean,
  /** Why this page's scripts rule wrapping out, if they do. */
  blockedBy: string | undefined,
): WrapResult {
  const edits: Edit[] = [];
  const wrapped: string[] = [];
  const skipped: string[] = [];

  for (const img of scanHtml(html).imgs) {
    const raw = img.attrs.src;
    if (raw === undefined) continue;
    const address = decodeEntities(raw).trim();
    const target = classifyRef(address, pagePath, exists);
    if (!target.resolvable || !target.target) continue;

    const copies = modern.get(target.target);
    if (!copies || (!copies.avif && !copies.webp)) continue;

    if (img.inPicture) continue;
    if ('srcset' in img.attrs) {
      skipped.push('it already lists its own srcset');
      continue;
    }
    if (Object.keys(img.attrs).some((a) => a.startsWith('data-') && a.includes('src'))) {
      skipped.push('a lazy-loading script looks after it');
      continue;
    }
    if (blockedBy) {
      skipped.push(blockedBy);
      continue;
    }
    if (/[\s,]/.test(address)) {
      skipped.push('its address contains a space or comma, which a srcset cannot hold');
      continue;
    }

    const source = (path: string, type: string) =>
      `<source type="${type}" srcset="${encodeAttrValue(replaceBasename(address, basenameOf(path)), '"')}">`;

    const sources =
      (copies.avif ? source(copies.avif, 'image/avif') : '') +
      (copies.webp ? source(copies.webp, 'image/webp') : '');

    edits.push({
      start: img.start,
      end: img.end,
      text: '<picture>' + sources + html.slice(img.start, img.end) + '</picture>',
    });
    wrapped.push(target.target);
  }

  return { text: applyEdits(html, edits), wrapped, skipped };
}
