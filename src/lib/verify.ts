import { buildGraph, type RefSite } from './graph';
import { applyEdits, decodeEntities, encodeAttrValue, type Edit } from './html-scan';
import { encodeCssValue } from './css-refs';
import { refsByFile } from './rewrite';
import { formatSrcset, parseSrcset } from './url-ref';
import type { Asset } from './types';

/**
 * Phase 5. The thing that lets Phase 4 ship.
 *
 * Folder mode is the first operation in Pare that can break a page, so before a
 * download is offered the before and after are both rendered and compared. If a
 * page moved, the download is not offered.
 *
 * Two decisions shape this file.
 *
 * **Rendering without a server.** Every reference is rewritten to a `blob:` URL
 * and the page itself is loaded from one, so relative addresses resolve without
 * anything to serve them. Blob URLs minted by this page are same-origin with it,
 * which is what makes `contentDocument` readable. That was ADR-006's open
 * question; this is the answer.
 *
 * **Layout, not pixels.** ADR-006 proposed a pixelmatch diff. A browser cannot
 * screenshot an iframe - there is no API - and the foreignObject workaround
 * cannot run scripts, taints the canvas, and silently drops resources it cannot
 * inline. What it can do reliably is read geometry. So this compares the position
 * and size of every element, plus whether each image and stylesheet actually
 * loaded, at each viewport. That catches the failure folder mode can actually
 * cause - a reference that no longer resolves - directly rather than by
 * inference. See ADR-017.
 */

export type VirtualFile = {
  path: string;
  bytes: Uint8Array;
  mime: string;
  kind: Asset['kind'];
};

/**
 * References are re-discovered from the exact text being rendered, never carried
 * in from elsewhere.
 *
 * An earlier version of this took offsets from the caller's graph. That graph was
 * built from the original files, so against minified-and-rewritten text every
 * offset was wrong and the splices landed mid-attribute - which shows up as
 * "everything is broken" rather than as the bug it was. Each side gets its own
 * graph, built from what it actually contains.
 */
function discoverRefs(files: VirtualFile[]): Map<string, RefSite[]> {
  const assets: Asset[] = files.map((f) => ({
    path: f.path,
    bytes: f.bytes,
    kind: f.kind,
    mime: f.mime,
    refs: [],
    resolvable: false,
  }));
  return refsByFile(buildGraph(assets).refs);
}

/** Widths a layout is most likely to differ at. */
export const VIEWPORTS = [360, 768, 1280];

export type ElementBox = {
  /** Stable path through the tree, e.g. `html>body>div:2>img`. */
  at: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Present for <img>: 0 means the image did not load. */
  natural?: number;
  /** Whether the element paints a background image. */
  background?: boolean;
  /**
   * For <img>: every computed property, addresses blanked. Wrapping an image in
   * a <picture> can stop a selector matching it without moving it a pixel -
   * `object-fit`, `filter`, `opacity` - so position alone cannot clear it.
   */
  style?: string;
};

export type PageSnapshot = {
  page: string;
  viewport: number;
  boxes: ElementBox[];
  documentHeight: number;
  /** Addresses that did not load. */
  failed: string[];
  stylesheets: number;
};

export type Finding = {
  page: string;
  viewport: number;
  severity: 'broken' | 'moved';
  message: string;
};

export type VerifyReport = {
  findings: Finding[];
  pagesChecked: number;
  /** True when nothing moved and nothing failed to load. */
  passed: boolean;
  /** Set when verification could not run at all. */
  unavailable?: string;
};

/* ------------------------------------------------------------------ *
 * Building a renderable copy
 * ------------------------------------------------------------------ */

const decoder = new TextDecoder('utf-8', { fatal: false });
const encoder = new TextEncoder();

/**
 * Rewrite every resolvable reference in a file to point at a blob URL.
 *
 * This is the same splice-a-byte-range machinery the renamer uses, pointed at a
 * different destination, so what gets rendered is the same text a visitor would
 * receive rather than a re-serialized approximation of it.
 */
function toBlobUrls(source: string, refs: RefSite[], urls: Map<string, string>): string {
  const edits: Edit[] = [];
  const groups = new Map<string, RefSite[]>();

  for (const ref of refs) {
    if (!ref.at || !ref.resolvable || !ref.target) continue;
    const key = `${ref.at.start}:${ref.at.end}`;
    const list = groups.get(key) ?? [];
    list.push(ref);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    const at = first.at!;
    const original = source.slice(at.start, at.end);

    if (group.some((r) => r.srcsetIndex !== undefined)) {
      const candidates = parseSrcset(decodeEntities(original));
      let touched = false;
      for (const ref of group) {
        const index = ref.srcsetIndex;
        const url = ref.target ? urls.get(ref.target) : undefined;
        if (index === undefined || !url || !candidates[index]) continue;
        candidates[index]!.url = url;
        touched = true;
      }
      if (touched) {
        edits.push({
          start: at.start,
          end: at.end,
          text: encodeAttrValue(formatSrcset(candidates), at.quote),
        });
      }
      continue;
    }

    const url = urls.get(first.target!);
    if (!url) continue;
    edits.push({
      start: at.start,
      end: at.end,
      text:
        at.syntax === 'html' ? encodeAttrValue(url, at.quote) : encodeCssValue(url, at.quote),
    });
  }

  return applyEdits(source, edits);
}

/**
 * Mint a blob URL for every file, innermost first.
 *
 * Order matters: a stylesheet's own `url()`s have to become blob URLs before the
 * stylesheet itself does, or the addresses inside it resolve against a blob URL
 * with no path and every background image silently disappears - which would show
 * up as a false failure in the report.
 */
function mintUrls(
  files: VirtualFile[],
  refsByFile: Map<string, RefSite[]>,
): { urls: Map<string, string>; revoke: () => void } {
  const urls = new Map<string, string>();
  const created: string[] = [];

  const make = (bytes: BlobPart, mime: string) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    created.push(url);
    return url;
  };

  const isText = (f: VirtualFile) => f.mime === 'text/css' || f.mime === 'text/html';

  // 1. Everything with no outgoing references.
  for (const file of files) {
    if (isText(file)) continue;
    urls.set(file.path, make(file.bytes as BufferSource, file.mime));
  }

  // 2. Stylesheets, repeatedly, so @import chains settle.
  const sheets = files.filter((f) => f.mime === 'text/css');
  for (let pass = 0; pass < sheets.length + 1; pass++) {
    let progressed = false;
    for (const sheet of sheets) {
      if (urls.has(sheet.path)) continue;
      const refs = refsByFile.get(sheet.path) ?? [];
      const pending = refs.some(
        (r) => r.resolvable && r.target && !urls.has(r.target) && r.target !== sheet.path,
      );
      if (pending) continue;
      const text = toBlobUrls(decoder.decode(sheet.bytes), refs, urls);
      urls.set(sheet.path, make(text, 'text/css'));
      progressed = true;
    }
    if (!progressed) break;
  }
  // Anything still unresolved is part of an import cycle; render it as-is.
  for (const sheet of sheets) {
    if (urls.has(sheet.path)) continue;
    urls.set(sheet.path, make(decoder.decode(sheet.bytes), 'text/css'));
  }

  // 3. Pages last, so they can point at everything above.
  for (const file of files) {
    if (file.mime !== 'text/html') continue;
    const text = toBlobUrls(decoder.decode(file.bytes), refsByFile.get(file.path) ?? [], urls);
    urls.set(file.path, make(text, 'text/html'));
  }

  return { urls, revoke: () => created.forEach((u) => URL.revokeObjectURL(u)) };
}

/* ------------------------------------------------------------------ *
 * Rendering and measuring
 * ------------------------------------------------------------------ */

/**
 * How many pages render at once. Each render is a hidden iframe whose time is
 * mostly layout and image decode, which the browser spreads across cores; one
 * lane per two cores keeps the tab responsive. Between 2 and 6.
 */
export const LANES = Math.max(2, Math.min(6, Math.floor((globalThis.navigator?.hardwareConcurrency || 4) / 2)));

/** Run `task` over `items`, LANES at a time. */
async function inLanes<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(LANES, items.length) }, lane));
}

/** Elements beyond this are not measured; a page that big has made the point. */
const MAX_ELEMENTS = 4000;

const LAYOUT_RESOLVED = new Set([
  'width',
  'height',
  'inline-size',
  'block-size',
  'transform-origin',
  'perspective-origin',
]);

function fingerprint(doc: Document, page: string, viewport: number): PageSnapshot {
  const boxes: ElementBox[] = [];
  const failed: string[] = [];

  const walk = (element: Element, at: string) => {
    if (boxes.length >= MAX_ELEMENTS) return;
    const rect = element.getBoundingClientRect();
    const box: ElementBox = {
      at,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    const computed = element.ownerDocument.defaultView?.getComputedStyle(element);

    // The tag name, not instanceof: elements in an iframe belong to that
    // frame's realm, where this realm's HTMLImageElement does not match.
    if (element.tagName === 'IMG') {
      const img = element as HTMLImageElement;
      box.natural = img.naturalWidth;
      if (img.currentSrc && img.naturalWidth === 0) {
        failed.push(img.getAttribute('src') ?? img.currentSrc);
      }
      if (computed) {
        const props: string[] = [];
        for (const name of computed) {
          // Resolved from layout, so sub-pixel noise from a minifier rounding a
          // percentage lands here. The geometry check already covers them, with
          // a tolerance.
          if (LAYOUT_RESOLVED.has(name)) continue;
          // Addresses are blob URLs that differ on each side by construction.
          props.push(name + ':' + computed.getPropertyValue(name).replace(/url\([^)]*\)/g, 'url()'));
        }
        box.style = props.join(';');
      }
    }

    // Geometry alone misses anything that paints without taking up space. A
    // background image that stops loading - or an inline style attribute that
    // gets erased - moves nothing at all, so it has to be looked for directly.
    // This check exists because an earlier build silently emptied every style
    // attribute and the layout diff reported the site as clean.
    const painted = computed?.getPropertyValue('background-image');
    if (painted && painted !== 'none') box.background = true;

    boxes.push(box);

    // A <picture> is see-through here: its <img> is compared as if it were a
    // child of the picture's parent, and its <source>s have no box to compare.
    // That is what lets ADR-021's wrapping be checked like-for-like; the img's
    // own box and style are what would show a wrapper changing anything.
    const children: Element[] = [];
    for (const child of element.children) {
      if (child.tagName === 'PICTURE') {
        for (const inner of child.children) if (inner.tagName !== 'SOURCE') children.push(inner);
      } else {
        children.push(child);
      }
    }

    const counts = new Map<string, number>();
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      const n = (counts.get(tag) ?? 0) + 1;
      counts.set(tag, n);
      walk(child, `${at}>${tag}:${n}`);
    }
  };

  if (doc.documentElement) walk(doc.documentElement, 'html');

  let stylesheets = 0;
  try {
    for (const sheet of doc.styleSheets) {
      // A stylesheet that failed to load has no rules.
      if (sheet.cssRules.length > 0) stylesheets++;
    }
  } catch {
    // Cross-origin sheet; we cannot count it, and should not guess.
    stylesheets = -1;
  }

  return {
    page,
    viewport,
    boxes,
    documentHeight: Math.round(doc.documentElement?.scrollHeight ?? 0),
    failed,
    stylesheets,
  };
}

/** Wait for any image still loading - a resize can start new ones (srcset). */
function imagesSettled(doc: Document): Promise<unknown> {
  return Promise.all(
    [...doc.images].map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((r) => {
            img.addEventListener('load', r, { once: true });
            img.addEventListener('error', r, { once: true });
            setTimeout(r, 2000);
          }),
    ),
  );
}

// A timer, not requestAnimationFrame: a browser stops animation frames in a
// background tab, and a run must keep going while the user looks elsewhere.
// Layout is already forced synchronously before this; it only lets the frame
// apply the new width's media queries and start any images they ask for.
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

/**
 * Load a page once and look at it at each width in turn, resizing the frame
 * in between. A reload per width cost three or four full page loads; a resize
 * re-runs media queries and layout, which is all a static page does with its
 * width. Images a new width asks for (srcset, <picture>) are waited for.
 */
async function renderWidths(
  url: string,
  widths: number[],
  page: string,
  inspect?: (doc: Document, width: number) => void,
): Promise<PageSnapshot[]> {
  const frame = document.createElement('iframe');
  // allow-same-origin without allow-scripts: the document is readable, and no
  // script runs. Both sides are measured the same way, so the comparison is
  // deterministic - see the note at the top about what that does and does not
  // cover.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${widths[0]}px;height:900px;border:0;visibility:hidden`;
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      frame.addEventListener('load', done, { once: true });
      // A page that never fires load still has to be measured rather than hang.
      setTimeout(done, 5000);
      frame.src = url;
    });

    const doc = frame.contentDocument;
    if (!doc) throw new Error('the preview could not be read');

    // Give the layout a frame to settle, and images a moment to decode.
    await new Promise((r) => setTimeout(r, 60));
    await imagesSettled(doc);

    const out: PageSnapshot[] = [];
    for (const [i, width] of widths.entries()) {
      if (i > 0) {
        frame.style.width = width + 'px';
        doc.documentElement?.getBoundingClientRect();
        await nextFrame();
        await imagesSettled(doc);
      }
      inspect?.(doc, width);
      out.push(fingerprint(doc, page, width));
    }
    return out;
  } finally {
    frame.remove();
  }
}

async function render(
  url: string,
  viewport: number,
  page: string,
  inspect?: (doc: Document) => void,
): Promise<PageSnapshot> {
  return (await renderWidths(url, [viewport], page, inspect && ((doc) => inspect(doc))))[0]!;
}

/* ------------------------------------------------------------------ *
 * Comparing
 * ------------------------------------------------------------------ */

/** A shift smaller than this is sub-pixel rounding, not a regression. */
const TOLERANCE = 1;

function compare(before: PageSnapshot, after: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const at = { page: after.page, viewport: after.viewport };

  for (const address of after.failed) {
    if (before.failed.includes(address)) continue;
    findings.push({
      ...at,
      severity: 'broken',
      message: `${address} did not load after optimizing, but did before.`,
    });
  }

  if (before.stylesheets > 0 && after.stylesheets < before.stylesheets) {
    findings.push({
      ...at,
      severity: 'broken',
      message: `${before.stylesheets - after.stylesheets} stylesheet(s) stopped loading.`,
    });
  }

  if (before.boxes.length !== after.boxes.length) {
    findings.push({
      ...at,
      severity: 'broken',
      message: `The page has ${after.boxes.length} elements after optimizing and had ${before.boxes.length} before.`,
    });
    return findings;
  }

  const byPath = new Map(before.boxes.map((b) => [b.at, b]));
  let moved = 0;
  let firstMoved: ElementBox | undefined;

  for (const box of after.boxes) {
    const was = byPath.get(box.at);
    if (!was) continue;
    const shifted =
      Math.abs(was.x - box.x) > TOLERANCE ||
      Math.abs(was.y - box.y) > TOLERANCE ||
      Math.abs(was.width - box.width) > TOLERANCE ||
      Math.abs(was.height - box.height) > TOLERANCE;
    if (shifted) {
      moved++;
      firstMoved ??= box;
    }
    if (was.natural !== undefined && box.natural === 0 && was.natural > 0) {
      findings.push({
        ...at,
        severity: 'broken',
        message: `An image at ${box.at} loaded before optimizing and does not now.`,
      });
    }
    if (was.style !== undefined && box.style !== undefined && was.style !== box.style) {
      findings.push({
        ...at,
        severity: 'moved',
        message: `An image at ${box.at} is styled differently after optimizing — a CSS rule that matched it before no longer does, or the other way round.`,
      });
    }
    if (was.background && !box.background) {
      findings.push({
        ...at,
        severity: 'broken',
        message: `The background image on ${box.at} is gone after optimizing.`,
      });
    }
  }

  if (moved > 0) {
    findings.push({
      ...at,
      severity: 'moved',
      message: `${moved} element${moved === 1 ? '' : 's'} changed position or size, starting at ${firstMoved?.at}.`,
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Render both versions of every page and report what changed.
 *
 * Runs on the main thread because it needs the DOM. It is the one part of Pare
 * that does; there is no worker API for laying out a page.
 */
export async function verify(
  before: VirtualFile[],
  after: VirtualFile[],
  pages: string[],
  onProgress: (ratio: number, label: string) => void = () => {},
): Promise<VerifyReport> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { findings: [], pagesChecked: 0, passed: false, unavailable: 'no DOM available' };
  }
  if (pages.length === 0) {
    return { findings: [], pagesChecked: 0, passed: true };
  }

  const beforeUrls = mintUrls(before, discoverRefs(before));
  const afterUrls = mintUrls(after, discoverRefs(after));
  const findings: Finding[] = [];
  const jobs = pages.flatMap((page) => VIEWPORTS.map((viewport) => ({ page, viewport })));
  let done = 0;

  const check = async (page: string) => {
    const a = beforeUrls.urls.get(page);
    const b = afterUrls.urls.get(page);
    try {
      if (!a || !b) return;
      const [was, now] = await Promise.all([
        renderWidths(a, VIEWPORTS, page),
        renderWidths(b, VIEWPORTS, page),
      ]);
      was.forEach((snapshot, i) => findings.push(...compare(snapshot, now[i]!)));
    } catch {
      for (const viewport of VIEWPORTS) {
        findings.push({
          page,
          viewport,
          severity: 'broken',
          message: 'This page could not be previewed, so it could not be checked.',
        });
      }
    } finally {
      done += VIEWPORTS.length;
      onProgress(done / jobs.length, `${done} of ${jobs.length}`);
    }
  };

  // Several page-and-viewport pairs at once (LANES). Each is two hidden
  // iframes; this is where a site with hundreds of pages spends its time.
  try {
    onProgress(0, `0 of ${jobs.length}`);
    await inLanes(pages, check);
    // Lanes finish out of order; report in a stable order.
    findings.sort(
      (x, y) =>
        pages.indexOf(x.page) - pages.indexOf(y.page) || x.viewport - y.viewport,
    );
  } finally {
    beforeUrls.revoke();
    afterUrls.revoke();
  }

  onProgress(1, 'Checked');
  return { findings, pagesChecked: pages.length, passed: findings.length === 0 };
}

export const toVirtual = (
  path: string,
  text: string,
  mime: string,
  kind: Asset['kind'],
): VirtualFile => ({ path, bytes: encoder.encode(text), mime, kind });

/* ------------------------------------------------------------------ *
 * Measuring displayed image sizes - ADR-030
 * ------------------------------------------------------------------ */

/**
 * Widths an image is measured at, with the device pixel ratio a screen of
 * that width usually has. Phones are 3x; everything wider is taken as 2x, so a
 * laptop or desktop image stays sharp on a high-resolution screen. 1920 is
 * here, beyond the verifier's own widths, because a full-width image is at its
 * largest on the widest screen.
 */
export const MEASURE_AT: Array<{ width: number; dpr: number }> = [
  { width: 360, dpr: 3 },
  { width: 768, dpr: 2 },
  { width: 1280, dpr: 2 },
  { width: 1920, dpr: 2 },
];

export type ImageMeasure = {
  /** Largest displayed width times that screen's pixel ratio, in image pixels. */
  needed: number;
  /** The image's own width, as the browser decoded it. */
  natural: number;
  /**
   * Set when any appearance could not be measured or does not let Pare decide
   * the size: it did not load, it sits in a <picture>, or it has a srcset.
   */
  unsure?: string;
};

/**
 * How large each image is ever shown, across every page at every width.
 * Keyed by folder-relative path. An image that never appears, or appears only
 * hidden, gets no entry.
 */
export async function measureImages(
  files: VirtualFile[],
  pages: string[],
): Promise<Map<string, ImageMeasure>> {
  const out = new Map<string, ImageMeasure>();
  if (typeof document === 'undefined' || pages.length === 0) return out;

  // A lazy image below the fold never loads in a measuring frame. This copy is
  // only ever measured, never shipped, so every image in it loads at once.
  const eager = files.map((f) =>
    f.kind === 'html'
      ? { ...f, bytes: encoder.encode(decoder.decode(f.bytes).replace(/\sloading\s*=\s*["']?lazy["']?/gi, '')) }
      : f,
  );
  const minted = mintUrls(eager, discoverRefs(eager));
  const pathOf = new Map([...minted.urls].map(([path, url]) => [url, path]));

  const note = (path: string, update: (m: ImageMeasure) => void) => {
    const m = out.get(path) ?? { needed: 0, natural: 0 };
    update(m);
    out.set(path, m);
  };

  const dprAt = new Map(MEASURE_AT.map((m) => [m.width, m.dpr]));
  try {
    await inLanes(pages, async (page) => {
      const url = minted.urls.get(page);
      if (!url) return;
      {
        await renderWidths(url, [...dprAt.keys()], page, (doc, width) => {
          const dpr = dprAt.get(width)!;
          for (const img of Array.from(doc.images)) {
            const path = pathOf.get(img.getAttribute('src') ?? '');
            if (!path) continue;
            if (img.closest('picture') || img.hasAttribute('srcset')) {
              note(path, (m) => (m.unsure = 'the browser picks its size from a srcset or <picture>'));
              continue;
            }
            if (!img.complete || img.naturalWidth === 0) {
              note(path, (m) => (m.unsure = 'it did not load while being measured'));
              continue;
            }
            const shown = img.getBoundingClientRect().width;
            // Hidden at this width (display:none, or a zero-width box): this
            // appearance says nothing about the size it needs.
            if (shown <= 0) continue;
            note(path, (m) => {
              m.natural = img.naturalWidth;
              m.needed = Math.max(m.needed, Math.ceil(shown * dpr));
            });
          }
        });
      }
    });
  } finally {
    minted.revoke();
  }

  for (const [path, m] of out) if (m.needed === 0 && !m.unsure) out.delete(path);
  return out;
}

/* ------------------------------------------------------------------ *
 * Possibly-unused CSS - ADR-031. A report, never a removal.
 * ------------------------------------------------------------------ */

export type UnusedRule = { selector: string; bytes: number };
export type UnusedSheet = { source: string; rules: UnusedRule[]; unusedBytes: number; totalBytes: number };

/** Split a selector list on top-level commas only - `:is(a, b)` stays whole. */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Pseudo-classes and pseudo-elements describe states and parts a static page
 * never shows - hover, focus, ::before. Stripped, the selector asks only "does
 * the element exist?", which is the question a report can answer. Stripping
 * can only make a selector match more, so it errs towards "used".
 */
export function structuralSelector(selector: string): string {
  return selector
    .replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, '')
    .replace(/\s+([>+~])\s*$/g, '')
    .trim();
}

function selectorMatches(doc: Document, selector: string): boolean {
  // Nesting (&) is relative to a parent rule this test cannot see: count it used.
  if (selector.includes('&')) return true;
  for (const candidate of [selector, structuralSelector(selector)]) {
    if (candidate === '' || /^[>+~]/.test(candidate)) return true;
    try {
      if (doc.querySelector(candidate)) return true;
    } catch {
      // Not a valid selector on its own (a pseudo-element); try the stripped form.
    }
  }
  return false;
}

/**
 * Every style rule in the site's own stylesheets and <style> blocks that
 * matched nothing on any page, with scripts off. Many will be genuinely dead;
 * some will be used by scripts, by server-generated content, by pages not in
 * the folder, or by states nobody rendered. That is why this is a list for a
 * person to read and never something Pare acts on (ADR-002, ADR-031).
 */
export async function findUnusedCss(files: VirtualFile[], pages: string[]): Promise<UnusedSheet[]> {
  if (typeof document === 'undefined' || pages.length === 0) return [];
  const minted = mintUrls(files, discoverRefs(files));
  const pathOf = new Map([...minted.urls].map(([path, url]) => [url, path]));

  type Seen = { selector: string; bytes: number; used: boolean };
  const sheets = new Map<string, Map<string, Seen>>();
  const totals = new Map<string, number>();

  const walk = (rules: CSSRuleList, source: string, doc: Document) => {
    for (const rule of Array.from(rules)) {
      const style = rule as CSSStyleRule;
      const nested = (rule as CSSGroupingRule).cssRules;
      if (typeof style.selectorText === 'string') {
        const key = style.selectorText;
        const bucket = sheets.get(source) ?? new Map<string, Seen>();
        sheets.set(source, bucket);
        const seen = bucket.get(key) ?? { selector: key, bytes: style.cssText.length, used: false };
        if (!seen.used) seen.used = splitSelectors(key).some((s) => selectorMatches(doc, s));
        bucket.set(key, seen);
      }
      if (nested && nested.length > 0) walk(nested, source, doc);
    }
  };

  try {
    await inLanes(pages, async (page) => {
      const url = minted.urls.get(page);
      if (!url) return;
      await render(url, 1280, page, (doc) => {
        for (const sheet of Array.from(doc.styleSheets)) {
          const source = sheet.href ? pathOf.get(sheet.href) : `${page} (<style>)`;
          if (!source) continue;
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue; // cross-origin; not ours to report on
          }
          if (!totals.has(source)) {
            totals.set(source, Array.from(rules).reduce((n, r) => n + r.cssText.length, 0));
          }
          walk(rules, source, doc);
        }
      });
    });
  } finally {
    minted.revoke();
  }

  const out: UnusedSheet[] = [];
  for (const [source, bucket] of sheets) {
    const rules = [...bucket.values()].filter((r) => !r.used).map(({ selector, bytes }) => ({ selector, bytes }));
    if (rules.length === 0) continue;
    out.push({
      source,
      rules,
      unusedBytes: rules.reduce((n, r) => n + r.bytes, 0),
      totalBytes: totals.get(source) ?? 0,
    });
  }
  return out.sort((a, b) => b.unusedBytes - a.unusedBytes);
}
