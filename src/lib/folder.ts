import * as Comlink from 'comlink';
import { scaledHeight } from './ladder';
import { hasGpsLocation } from './metadata';
import type { Remote } from 'comlink';
import { buildGraph, type Graph } from './graph';
import { contentHash, hashedPath } from './hash';
import { needsFor } from './needs';

const SAME_FORMAT_CODEC: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/bmp': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
import { isTextKind, type Settings } from './optimize';
import { run, runAll } from './pool';
import { refsByFile, rewriteReferences } from './rewrite';
import type { Asset, TextKind, Warning } from './types';
import { measureImages, type ImageMeasure, type VirtualFile } from './verify';
import { addDimensions } from './picture-wrap';
import {
  imageSensitiveSelector,
  scriptsBlockWrapping,
  wrapImages,
  type ModernCopies,
} from './picture-wrap';
import { scanHtml } from './html-scan';
import { splitPath } from './naming';
import type { PipelineApi } from '../workers/pipeline.worker';

/**
 * Folder mode. Phase 4.
 *
 * Drop a whole site in and get a `dist/` back: every asset optimized in place,
 * every file Law 3 allows content-hashed for caching, and every reference to a
 * renamed file updated.
 *
 * The shape of this is set by one rule - **bytes change, markup does not**. Each
 * file is replaced by a smaller version of itself in the same format, so nothing
 * in any page has to be restructured. The only edits made to HTML and CSS are
 * addresses, and only addresses that graph.ts proved safe to move.
 *
 * That restraint is what makes the Phase 5 verifier able to give a useful answer:
 * when the intended diff is "some filenames changed", any layout difference at
 * all is a real finding.
 */

export type FolderSettings = {
  /** Content-hash filenames for long-term caching, where Law 3 allows. */
  hash: boolean;
  /** Re-encode images in their own format. */
  images: boolean;
  /** Minify CSS, JS, HTML and SVG. */
  text: boolean;
  /**
   * Bundle `<script type="module">` graphs into one file each.
   *
   * Off by default. ADR-003 permits it for modules, and the byte saving from
   * tree-shaking is real, but the Phase 5 verifier renders with scripts disabled
   * (ADR-017) and so cannot confirm the result behaves the same. Anything Pare
   * cannot check is the user's decision to make, not ours - the same treatment
   * font subsetting gets in ADR-011.
   */
  bundle: boolean;
  /**
   * Subset fonts to the characters the site actually contains.
   *
   * Off by default, for the reason in ADR-011: a static scan cannot see text a
   * server produces later. Folder mode is the strongest possible case for it -
   * every page is here, not just one - but "every page in this folder" is still
   * not "every page this site will serve".
   *
   * Only fonts already in WOFF2 are touched. Anything else would change the file
   * extension, which means rewriting the `format()` token inside `@font-face`
   * rather than swapping an address, and that is restructuring rather than
   * renaming.
   */
  fonts: boolean;
  /**
   * Make AVIF and WebP copies of JPEG and PNG images, and wrap each plain `<img>`
   * that shows one in a `<picture>` offering them.
   *
   * Off by default: it is the one step that changes markup rather than bytes and
   * addresses. Fenced in picture-wrap.ts and checked by the verifier. ADR-021.
   */
  modern: boolean;
  /**
   * Scale each image down to the largest size any page shows it at, times the
   * screen's pixel ratio. Never enlarges; only images that nothing but plain
   * <img> tags point at. ADR-030.
   */
  rightSize: boolean;
  /**
   * Give each `<img>` without them a width and height, so the page keeps the
   * image's space while it loads. Only where trying them on in every rendered
   * page moves nothing. ADR-037.
   */
  dimensions: boolean;
};

export const FOLDER_DEFAULTS: FolderSettings = {
  hash: true,
  images: true,
  text: true,
  bundle: false,
  fonts: false,
  modern: false,
  rightSize: true,
  dimensions: true,
};

export type FolderFile = {
  path: string;
  /** Final path in the output, after any content hash. */
  outputPath: string;
  bytes: Uint8Array;
  bytesBefore: number;
  kind: Asset['kind'];
  skipped?: string;
  /** For a new AVIF/WebP copy: the image it was made from. Not in the "before". */
  siblingOf?: string;
  /** Set on new files, which have no input asset to take a type from. */
  mime?: string;
  /**
   * What a visitor downloads in this file's place, when that is not the file
   * itself: the smallest modern copy, once every reference to the image offers
   * one. ADR-009.
   */
  bytesServed?: number;
  /**
   * A BMP re-encoded as PNG (ADR-026). Converting changes the extension, so it
   * needs a new name - granted only where every reference can be rewritten,
   * and undone otherwise.
   */
  converted?: { original: Uint8Array; ext: string };
  /** Scaled down to the size it is shown at (ADR-030). */
  resized?: { from: number; to: number };
};

export type FolderResult = {
  files: FolderFile[];
  /** Module entries that were bundled, and the files folded into each. */
  bundled: Array<{ entry: string; absorbed: string[] }>;
  graph: Graph;
  /** Original path to hashed path, for everything that was renamed. */
  renamed: Map<string, string>;
  warnings: Warning[];
  /** How many addresses were updated across all pages and stylesheets. */
  rewritten: number;
  /** Pages, for the verifier to render. */
  pages: string[];
  /** How many `<img>` elements were wrapped in a `<picture>`. */
  pictures: number;
  /** How many images were scaled down to the size they are shown at. */
  resized: number;
  /** Photos that carried a GPS position the output no longer does. */
  locationsRemoved: number;
  /** `<img>` tags given a width and height (ADR-037). */
  sized: number;
};

const decoder = new TextDecoder('utf-8', { fatal: false });
const encoder = new TextEncoder();

const MIME_BY_KIND: Partial<Record<Asset['kind'], string>> = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  svg: 'image/svg+xml',
  json: 'application/json',
  xml: 'application/xml',
};

/**
 * Optimize every asset, then rename and rewrite.
 *
 * Two graphs get built, and the reason is worth stating. Permission to rename
 * comes from the ORIGINAL files, because that is the text the user wrote and the
 * only text whose references are the whole truth - a minifier can drop a comment
 * that held one. Rewriting uses a graph rebuilt from the OPTIMIZED text, because
 * minifying moves every byte offset and a splice at a stale offset lands in the
 * middle of an attribute.
 *
 * The two are intersected, so a file may only be renamed if both agree. That is
 * the safe direction: the worst case is a missed cache-busting hash.
 */
export async function optimizeFolder(
  assets: Asset[],
  settings: Settings,
  folder: FolderSettings,
  onUpdate: (path: string, ratio: number, label: string) => void = () => {},
  onStage: (text: string) => void = () => {},
): Promise<FolderResult> {
  const warnings: Warning[] = [];

  // 0. Bundle module graphs first, if asked. It has to happen before anything
  //    else touches the JavaScript, because esbuild wants the sources as the
  //    author wrote them and does its own minification on the way out.
  const bundles = folder.bundle
    ? await bundleModules(assets, warnings)
    : { replaced: new Map<string, Uint8Array>(), absorbed: new Set<string>(), bundled: [] };

  const surviving = assets.filter((a) => !bundles.absorbed.has(a.path));
  // A file folded into a bundle is finished; say so, or its row waits forever.
  for (const path of bundles.absorbed) onUpdate(path, 1, '');

  const copies = new Map<string, { avif?: Uint8Array; webp?: Uint8Array }>();

  // Characters the whole site contains, for font subsetting. Gathered once, up
  // front, because every font job needs the same answer.
  let used: number[] = [];
  if (folder.fonts && surviving.some((a) => a.kind === 'font')) {
    // Templates hold page text too; a WordPress theme's words live there.
    const texts = surviving.filter((a) => isTextKind(a.kind) || a.kind === 'template');
    const found = await runAll(texts, (asset, api) => api.scanCodepoints(asset.bytes));
    used = [...new Set(found.flat())];
  }

  // The graph of the ORIGINAL text decides permissions: renaming (Law 3), and
  // now also which images may be right-sized. Built before anything changes.
  const originalGraph = buildGraph(surviving);
  const audit = await run((api) => api.auditGraph(surviving, originalGraph));
  for (const path of audit.removed) originalGraph.renameable.delete(path);
  warnings.push(...originalGraph.warnings, ...audit.warnings);
  const templated = surviving.some((a) => a.kind === 'template');

  // 0b. How large each image is ever shown (ADR-030). Only an image that
  //     nothing but plain <img src> points at qualifies: a stylesheet, a script
  //     or a template could show it larger somewhere Pare never rendered.
  const targets = new Map<string, { width: number }>();
  /** Images every <img> may be given a width and height for (ADR-037). */
  const sizable = new Map<string, ImageMeasure>();
  const rightSizing = folder.images && folder.rightSize;
  const measuring = (async () => {
    if (!(rightSizing || folder.dimensions) || templated || originalGraph.entries.length === 0) return;
    onStage('Measuring how large each image is shown, at four screen widths…');
    const sizes = await measureImages(toVirtual(surviving), originalGraph.entries);
    for (const [path, m] of sizes) {
      const refs = originalGraph.byTarget.get(path) ?? [];
      const plainImg = refs.length > 0 && refs.every((r) => r.context === '<img src>' && r.resolvable);
      if (!plainImg || m.unsure) continue;
      if (folder.dimensions && m.dimsMissing && !m.dimsUnsafe && m.naturalHeight > 0) sizable.set(path, m);
      if (!rightSizing || !originalGraph.renameable.has(path)) continue;
      // Worth it only when it saves real pixels: 10% of the width or more.
      if (m.natural > m.needed * 1.1) targets.set(path, { width: m.needed });
    }
    onStage('');
  })();

  // 1. Optimize each file's bytes, in place and in its own format.
  //
  //    Everything that is not an image starts at once, while the pages are
  //    still being measured; images, which need the measurements, follow.
  //    Measuring renders in iframes on this thread and the codecs run in
  //    workers, so the two overlap rather than compete.
  const siteNeeds = (asset: Asset): string[] => {
    if (asset.kind === 'image') {
      // Whole-site mode re-encodes in the image's own format (ADR-026: BMP to PNG).
      const own = SAME_FORMAT_CODEC[asset.mime];
      return own ? ['resize', own, ...(folder.modern ? ['avif', 'webp'] : [])] : [];
    }
    return needsFor(asset, settings);
  };
  const run1 = (list: Asset[]) =>
    runAll(
      list,
      async (asset, api): Promise<FolderFile> => {
        const file = await optimizeOne(asset, api);
        onUpdate(asset.path, 1, '');
        return file;
      },
      siteNeeds,
    );
  const isImage = (a: Asset) => a.kind === 'image' && folder.images;
  const [others] = await Promise.all([run1(surviving.filter((a) => !isImage(a))), measuring]);
  const images = await run1(surviving.filter(isImage));
  // Back in the order the files came in, so the output lists them as dropped.
  const byPath = new Map([...others, ...images].map((f) => [f.path, f]));
  const optimized = surviving.map((a) => byPath.get(a.path)!);

  async function optimizeOne(
    asset: Asset,
    api: Remote<PipelineApi>,
  ): Promise<FolderFile> {
    const base: FolderFile = {
      path: asset.path,
      outputPath: asset.path,
      bytes: asset.bytes,
      bytesBefore: asset.bytes.byteLength,
      kind: asset.kind,
    };
    const report = Comlink.proxy((ratio: number, label: string) =>
      onUpdate(asset.path, ratio, label),
    );

    const bundled = bundles.replaced.get(asset.path);
    if (bundled) return { ...base, bytes: bundled };

    if (asset.kind === 'image' && folder.images && asset.mime === 'image/heic') {
      warnings.push({
        path: asset.path,
        message:
          'Left as HEIC. Only Safari can show it, and converting it would change how the page looks everywhere else - something the before-and-after check cannot compare fairly. To get JPEG, WebP and AVIF versions, use "Just give me optimized files and snippets".',
      });
      return base;
    }

    if (asset.kind === 'image' && folder.images && asset.mime === 'image/bmp') {
      const result = await api.bmpToPng(asset.bytes);
      if (!result.bytes) return { ...base, skipped: result.skipped };
      return { ...base, bytes: result.bytes, mime: 'image/png', converted: { original: asset.bytes, ext: 'png' } };
    }

    if (asset.kind === 'image' && folder.images) {
      const result = await api.reencodeImage(
        asset.mime,
        asset.bytes,
        settings.image.quality.fallback,
        settings.image.stripMetadata,
        folder.modern
          ? { avif: settings.image.quality.avif, webp: settings.image.quality.webp }
          : undefined,
        report,
        targets.get(asset.path)?.width,
      );
      for (const w of result.warnings) warnings.push({ path: asset.path, message: w });
      if (result.avif || result.webp) copies.set(asset.path, { avif: result.avif, webp: result.webp });
      return { ...base, bytes: result.bytes, skipped: result.skipped, resized: result.resized };
    }

    if (asset.kind === 'font' && folder.fonts) {
      // Only WOFF2 in, one WOFF2 out, under the same name - so the @font-face
      // rule that points at it needs no change at all.
      if (!asset.path.toLowerCase().endsWith('.woff2')) {
        warnings.push({
          path: asset.path,
          message:
            'Left this font alone — repacking it would change its file extension, which means editing the @font-face rule rather than just its address.',
        });
        return base;
      }

      const result = await api.optimizeFont(
        asset.path,
        asset.bytes,
        { mode: 'used', extraText: '', display: 'swap', preload: false, woff: false },
        used,
        report,
      );
      for (const w of result.warnings) warnings.push({ path: asset.path, message: w });

      const only = result.slices.length === 1 ? result.slices[0] : undefined;
      if (!only || only.bytes.byteLength >= asset.bytes.byteLength) {
        return { ...base, skipped: result.skipped ?? 'Already as small as it gets.' };
      }
      return { ...base, bytes: only.bytes };
    }

    if (isTextKind(asset.kind) && folder.text) {
      const result = await api.optimizeText(
        asset.path,
        asset.kind as TextKind,
        asset.bytes,
        // Compressed siblings are for a server to pick up; folder mode's job is
        // the tree itself, and .gz copies of every file would double the zip.
        { ...settings.text, gzip: false, brotli: false, sourceMaps: false },
        report,
      );
      for (const w of result.warnings) warnings.push({ path: asset.path, message: w });
      return { ...base, bytes: result.minified, skipped: result.skipped };
    }

    return base;
  }

  // 2. Re-discover references in whatever the optimizers produced, since
  //    minifying moves every offset. (The original graph was built up front.)

  // 2a. Width and height on <img> tags that lack them, at the image's final
  //     size, where trying them on moved nothing (ADR-037).
  let sized = 0;
  if (sizable.size > 0) {
    const paths = new Set(optimized.map((f) => f.path));
    const final = new Map(
      [...sizable].map(([path, m]) => {
        const resized = optimized.find((f) => f.path === path)?.resized;
        return [
          path,
          resized
            ? { width: resized.to, height: scaledHeight(m.natural, m.naturalHeight, resized.to) }
            : { width: m.natural, height: m.naturalHeight },
        ] as const;
      }),
    );
    for (const page of optimized) {
      if (page.kind !== 'html') continue;
      const result = addDimensions(decoder.decode(page.bytes), page.path, final, (p) => paths.has(p));
      if (result.added === 0) continue;
      page.bytes = encoder.encode(result.text);
      sized += result.added;
    }
  }

  // 2b. Offer AVIF and WebP through <picture>, where that is safe. ADR-021.
  const modern = folder.modern
    ? wrapPictures(optimized, surviving, copies, originalGraph, warnings)
    : { siblings: [], pictures: 0 };
  const siblings = modern.siblings;
  const all = [...optimized, ...siblings];

  const rewrittenAssets: Asset[] = all.map((file) => {
    const asset = surviving.find((a) => a.path === file.path);
    if (asset) return { ...asset, bytes: file.bytes };
    return { path: file.path, bytes: file.bytes, kind: file.kind, mime: file.mime!, refs: [], resolvable: false };
  });
  const graph = buildGraph(rewrittenAssets);
  // Permission comes from the original graph: minification can only lose
  // references (a minifier may drop a comment holding one), never gain them, so
  // intersecting is the safe direction. A new AVIF/WebP copy did not exist then;
  // it inherits the verdict on the image it was made from, since the only
  // references to it are the ones Pare just wrote beside that image's own.
  for (const path of [...graph.renameable]) {
    const sibling = siblings.find((s) => s.path === path);
    const origin = sibling?.siblingOf ?? path;
    if (!originalGraph.renameable.has(origin)) graph.renameable.delete(path);
  }

  // 3. Decide new names.
  const renamed = new Map<string, string>();
  // ADR-027: a folder with server templates (a WordPress theme, say) is never
  // renamed. A child theme, a plugin or the database can name these files from
  // outside the folder, and WordPress adds ?ver= for caching anyway.
  if (templated && folder.hash) {
    warnings.push({
      path: surviving.find((a) => a.kind === 'template')!.path,
      message:
        'Nothing was renamed: this folder has server templates (PHP or similar), and files outside it - a child theme, a plugin, the database - may refer to these files by name. Every file kept its name.',
    });
  }
  const taken = new Set(all.map((f) => f.path));
  for (const file of all) {
    if (file.converted) {
      // A converted file must be renamed to its new extension, or it is
      // served as one format under another's name. Where that is not allowed,
      // the conversion is undone.
      const { dir, stem } = splitPath(file.path);
      const target = (dir ? dir + '/' : '') + stem + '.' + file.converted.ext;
      const reason = templated
        ? 'this folder has server templates, which may name it'
        : !graph.renameable.has(file.path)
          ? 'something refers to it in a way Pare cannot rewrite'
          : taken.has(target)
            ? `a file named ${target} already exists`
            : undefined;
      if (reason) {
        warnings.push({
          path: file.path,
          message: `Kept as BMP: converting it to PNG means a new name, and ${reason}.`,
        });
        file.bytes = file.converted.original;
        file.mime = undefined;
        file.converted = undefined;
        continue;
      }
      taken.add(target);
      renamed.set(
        file.path,
        folder.hash ? hashedPath(target, await contentHash(file.bytes)) : target,
      );
      continue;
    }
    if (!folder.hash || templated || !graph.renameable.has(file.path)) continue;
    renamed.set(file.path, hashedPath(file.path, await contentHash(file.bytes)));
  }

  // 4. Rewrite addresses in pages and stylesheets.
  const perFile = refsByFile(graph.refs);
  let rewritten = 0;

  const files = all.map((file): FolderFile => {
    const outputPath = renamed.get(file.path) ?? file.path;
    const canHoldRefs = file.kind === 'html' || file.kind === 'css';
    if (!canHoldRefs || renamed.size === 0) return { ...file, outputPath };

    const result = rewriteReferences(
      decoder.decode(file.bytes),
      perFile.get(file.path) ?? [],
      renamed,
    );
    rewritten += result.rewritten;
    return {
      ...file,
      outputPath,
      bytes: result.rewritten > 0 ? encoder.encode(result.text) : file.bytes,
    };
  });

  return {
    files,
    bundled: bundles.bundled,
    graph,
    renamed,
    warnings,
    rewritten,
    pages: graph.entries,
    pictures: modern.pictures,
    resized: files.filter((f) => f.resized).length,
    sized,
    locationsRemoved: assets.filter(
      (a) =>
        a.kind === 'image' &&
        hasGpsLocation(a.bytes) &&
        files.some((f) => f.path === a.path && !f.siblingOf && !hasGpsLocation(f.bytes)),
    ).length,
  };
}

/**
 * Offer AVIF and WebP copies through `<picture>`, wherever picture-wrap.ts says
 * that cannot change what a page matches. ADR-021.
 *
 * Mutates the bytes of the pages it wraps. Returns the copies that something now
 * offers; a copy no page wraps is useless and is not emitted.
 */
function wrapPictures(
  files: FolderFile[],
  /** As dropped in: selectors are quoted to the user as they wrote them. */
  originals: Asset[],
  copies: Map<string, { avif?: Uint8Array; webp?: Uint8Array }>,
  original: Graph,
  warnings: Warning[],
): { siblings: FolderFile[]; pictures: number } {

  const none = { siblings: [], pictures: 0 };
  if (copies.size === 0) return none;
  const text = (f: FolderFile) => decoder.decode(f.bytes);

  // 1. One position-sensitive selector anywhere, and nothing is wrapped at all.
  for (const file of originals) {
    const source = decoder.decode(file.bytes);
    const sheets =
      file.kind === 'css'
        ? [source]
        : file.kind === 'html'
          ? scanHtml(source).raw.filter((r) => r.tag === 'style').map((r) => r.text)
          : [];
    for (const css of sheets) {
      const selector = imageSensitiveSelector(css);
      if (!selector) continue;
      warnings.push({
        path: file.path,
        message: `No image was given AVIF or WebP copies — the selector "${selector}" picks images by their position or by <picture>, and wrapping an image would change what it matches.`,
      });
      return none;
    }
  }

  // 2. Name each copy beside its original, never over a file that exists.
  const taken = new Set(files.map((f) => f.path));
  const named = new Map<string, ModernCopies>();
  const madeBytes = new Map<string, Uint8Array>();
  for (const [path, made] of copies) {
    const { dir, stem } = splitPath(path);
    const entry: ModernCopies = {};
    for (const format of ['avif', 'webp'] as const) {
      const bytes = made[format];
      if (!bytes) continue;
      const candidate = (dir ? dir + '/' : '') + stem + '.' + format;
      if (taken.has(candidate)) continue;
      taken.add(candidate);
      entry[format] = candidate;
      madeBytes.set(candidate, bytes);
    }
    if (entry.avif || entry.webp) named.set(path, entry);
  }

  // 3. Wrap, page by page.
  const paths = new Set(files.map((f) => f.path));
  const exists = (p: string) => paths.has(p);
  const scripts = new Map(files.filter((f) => f.kind === 'js').map((f) => [f.path, text(f)]));
  const wrapped = new Map<string, number>();

  for (const page of files) {
    if (page.kind !== 'html') continue;
    const html = text(page);
    const blocked = scriptsBlockWrapping(html, page.path, scripts, exists);
    const result = wrapImages(html, page.path, named, exists, blocked);

    if (result.wrapped.length > 0) page.bytes = encoder.encode(result.text);
    for (const target of result.wrapped) wrapped.set(target, (wrapped.get(target) ?? 0) + 1);

    const reasons = new Map<string, number>();
    for (const reason of result.skipped) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    for (const [reason, count] of reasons) {
      warnings.push({
        path: page.path,
        message: `Kept ${count} image${count === 1 ? '' : 's'} as a plain <img>, without AVIF or WebP — ${reason}.`,
      });
    }
  }

  // 4. Emit only copies a page now offers, and credit the saving only where
  //    every reference to the image offers one (ADR-009).
  const out: FolderFile[] = [];
  let pictures = 0;
  for (const [source, entry] of named) {
    const count = wrapped.get(source) ?? 0;
    if (count === 0) continue;
    pictures += count;

    const sizes: number[] = [];
    for (const [format, path] of Object.entries(entry) as Array<['avif' | 'webp', string]>) {
      const bytes = madeBytes.get(path)!;
      sizes.push(bytes.byteLength);
      out.push({
        path,
        outputPath: path,
        bytes,
        bytesBefore: 0,
        kind: 'image',
        siblingOf: source,
        mime: 'image/' + format,
      });
    }

    const file = files.find((f) => f.path === source)!;
    const references = original.byTarget.get(source)?.length ?? 0;
    if (count === references) {
      file.bytesServed = Math.min(file.bytes.byteLength, ...sizes);
    } else {
      warnings.push({
        path: source,
        message:
          'Some places that use this image still load the original — a stylesheet or a link, for instance, has no way to offer AVIF or WebP — so the saving shown counts the original.',
      });
    }
  }

  return { siblings: out, pictures };
}


/**
 * Bundle every `<script type="module">` graph, and work out which of the files
 * folded into each one can safely stop existing.
 *
 * Removing a file is the part that needs care. A module whose code now lives
 * inside the bundle is not lost - but something else may still fetch it by name,
 * and Pare cannot see that. So a file is only dropped when all of these hold:
 *
 *   - esbuild actually inlined it, and it is not the entry itself
 *   - nothing in any page or stylesheet points at it
 *   - it is not itself a module entry for some other page
 *   - no script outside the bundle so much as mentions its filename
 *   - the bundle contained no dynamic import, which could name anything
 *
 * When any of those fails the file is kept, and the only cost is a few bytes.
 * This is Law 3's reasoning applied to a different question.
 */
async function bundleModules(
  assets: Asset[],
  warnings: Warning[],
): Promise<{
  replaced: Map<string, Uint8Array>;
  absorbed: Set<string>;
  bundled: Array<{ entry: string; absorbed: string[] }>;
}> {
  const graph = buildGraph(assets);
  const entries = [
    ...new Set(
      graph.refs
        .filter((r) => r.module && r.resolvable && r.target)
        .map((r) => r.target!),
    ),
  ];

  const replaced = new Map<string, Uint8Array>();
  const absorbed = new Set<string>();
  const bundled: Array<{ entry: string; absorbed: string[] }> = [];

  if (entries.length === 0) return { replaced, absorbed, bundled };

  const sources: Record<string, string> = {};
  for (const asset of assets) {
    if (asset.kind === 'js') sources[asset.path] = decoder.decode(asset.bytes);
  }

  for (const entry of entries) {
    let result;
    try {
      result = await run((api) => api.bundleModule(entry, sources));
    } catch {
      warnings.push({
        path: entry,
        message:
          'This module could not be bundled, so it and everything it imports were left as separate files.',
      });
      continue;
    }

    for (const message of result.warnings) warnings.push({ path: entry, message });
    replaced.set(entry, encoder.encode(result.code));

    const folded: string[] = [];
    if (result.dynamic) {
      warnings.push({
        path: entry,
        message:
          'This module loads something with a dynamic import, so every file it imports was kept in place — the address could name any of them.',
      });
    } else {
      for (const input of result.inputs) {
        if (input === entry || absorbed.has(input)) continue;
        if (!sources[input]) continue;
        if ((graph.byTarget.get(input) ?? []).length > 0) continue;
        if (entries.includes(input)) continue;

        const namedElsewhere = Object.entries(sources).some(
          ([path, text]) =>
            !result.inputs.includes(path) && text.includes(input.slice(input.lastIndexOf('/') + 1)),
        );
        if (namedElsewhere) continue;

        absorbed.add(input);
        folded.push(input);
      }
    }

    bundled.push({ entry, absorbed: folded });
  }

  return { replaced, absorbed, bundled };
}

/** Assets as the verifier and the measurer render them. */
export function toVirtual(assets: Asset[]): VirtualFile[] {
  return assets.map((asset) => ({
    path: asset.path,
    bytes: asset.bytes,
    mime: MIME_BY_KIND[asset.kind] ?? asset.mime,
    kind: asset.kind,
  }));
}

/**
 * The two file sets the verifier renders: the originals, and what folder mode
 * produced.
 */
export function verificationInputs(
  assets: Asset[],
  result: FolderResult,
): { before: VirtualFile[]; after: VirtualFile[] } {
  const mimeOf = (asset: Asset) => MIME_BY_KIND[asset.kind] ?? asset.mime;
  const byPath = new Map(assets.map((a) => [a.path, a]));

  const before = assets.map((asset) => ({
    path: asset.path,
    bytes: asset.bytes,
    mime: mimeOf(asset),
    kind: asset.kind,
  }));

  // The after side is keyed by OUTPUT path, because that is what the rewritten
  // addresses inside it now point at. Keying it by the original names would make
  // every rewritten reference resolve to nothing and report the whole site as
  // broken. Pages are never renamed, so both sides still share page paths.
  const after = result.files.map((file) => {
    const asset = byPath.get(file.path);
    return {
      path: file.outputPath,
      bytes: file.bytes,
      mime: file.mime ?? (asset ? mimeOf(asset) : 'application/octet-stream'),
      kind: file.kind,
    };
  });

  return { before, after };
}

/** Everything folder mode produced, at its final name, ready to zip. */
export function distFiles(result: FolderResult): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const file of result.files) out[file.outputPath] = file.bytes;
  return out;
}
