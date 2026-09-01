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

/** Elements beyond this are not measured; a page that big has made the point. */
const MAX_ELEMENTS = 4000;

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

    if (element instanceof HTMLImageElement) {
      box.natural = element.naturalWidth;
      if (element.currentSrc && element.naturalWidth === 0) {
        failed.push(element.getAttribute('src') ?? element.currentSrc);
      }
    }

    // Geometry alone misses anything that paints without taking up space. A
    // background image that stops loading - or an inline style attribute that
    // gets erased - moves nothing at all, so it has to be looked for directly.
    // This check exists because an earlier build silently emptied every style
    // attribute and the layout diff reported the site as clean.
    const painted = element.ownerDocument.defaultView
      ?.getComputedStyle(element)
      .getPropertyValue('background-image');
    if (painted && painted !== 'none') box.background = true;

    boxes.push(box);

    const counts = new Map<string, number>();
    for (const child of element.children) {
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

async function render(url: string, viewport: number, page: string): Promise<PageSnapshot> {
  const frame = document.createElement('iframe');
  // allow-same-origin without allow-scripts: the document is readable, and no
  // script runs. Both sides are measured the same way, so the comparison is
  // deterministic - see the note at the top about what that does and does not
  // cover.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${viewport}px;height:900px;border:0;visibility:hidden`;
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
    await Promise.all(
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

    return fingerprint(doc, page, viewport);
  } finally {
    frame.remove();
  }
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
  const total = pages.length * VIEWPORTS.length;
  let done = 0;

  try {
    for (const page of pages) {
      const a = beforeUrls.urls.get(page);
      const b = afterUrls.urls.get(page);
      if (!a || !b) continue;

      for (const viewport of VIEWPORTS) {
        onProgress(done / total, `${page} at ${viewport}px`);
        try {
          const [was, now] = await Promise.all([
            render(a, viewport, page),
            render(b, viewport, page),
          ]);
          findings.push(...compare(was, now));
        } catch {
          findings.push({
            page,
            viewport,
            severity: 'broken',
            message: 'This page could not be previewed, so it could not be checked.',
          });
        }
        done++;
      }
    }
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
