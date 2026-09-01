import * as Comlink from 'comlink';
import { buildGraph, type Graph } from './graph';
import { contentHash, hashedPath } from './hash';
import { isTextKind, type Settings } from './optimize';
import { run, runAll } from './pool';
import { refsByFile, rewriteReferences } from './rewrite';
import type { Asset, TextKind, Warning } from './types';
import type { VirtualFile } from './verify';

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
};

export const FOLDER_DEFAULTS: FolderSettings = {
  hash: true,
  images: true,
  text: true,
  bundle: false,
  fonts: false,
};

export type FolderFile = {
  path: string;
  /** Final path in the output, after any content hash. */
  outputPath: string;
  bytes: Uint8Array;
  bytesBefore: number;
  kind: Asset['kind'];
  skipped?: string;
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
};

const decoder = new TextDecoder('utf-8', { fatal: false });
const encoder = new TextEncoder();

const MIME_BY_KIND: Partial<Record<Asset['kind'], string>> = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  svg: 'image/svg+xml',
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
): Promise<FolderResult> {
  const warnings: Warning[] = [];

  // 0. Bundle module graphs first, if asked. It has to happen before anything
  //    else touches the JavaScript, because esbuild wants the sources as the
  //    author wrote them and does its own minification on the way out.
  const bundles = folder.bundle
    ? await bundleModules(assets, warnings)
    : { replaced: new Map<string, Uint8Array>(), absorbed: new Set<string>(), bundled: [] };

  const surviving = assets.filter((a) => !bundles.absorbed.has(a.path));

  // Characters the whole site contains, for font subsetting. Gathered once, up
  // front, because every font job needs the same answer.
  let used: number[] = [];
  if (folder.fonts && surviving.some((a) => a.kind === 'font')) {
    const texts = surviving.filter((a) => isTextKind(a.kind));
    const found = await runAll(texts, (asset, api) => api.scanCodepoints(asset.bytes));
    used = [...new Set(found.flat())];
  }

  // 1. Optimize each file's bytes, in place and in its own format.
  const optimized = await runAll(surviving, async (asset, api): Promise<FolderFile> => {
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

    if (asset.kind === 'image' && folder.images) {
      const result = await api.reencodeImage(
        asset.mime,
        asset.bytes,
        settings.image.quality.fallback,
        settings.image.stripMetadata,
      );
      for (const w of result.warnings) warnings.push({ path: asset.path, message: w });
      return { ...base, bytes: result.bytes, skipped: result.skipped };
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
        { mode: 'used', extraText: '', display: 'swap', preload: false },
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
        { ...settings.text, gzip: false, brotli: false },
        report,
      );
      for (const w of result.warnings) warnings.push({ path: asset.path, message: w });
      return { ...base, bytes: result.minified, skipped: result.skipped };
    }

    return base;
  });

  // 2. Build the graph from the ORIGINAL text, then re-discover references in
  //    whatever the optimizers produced, since minifying moves every offset.
  const originalGraph = buildGraph(surviving);
  const audit = await run((api) => api.auditGraph(surviving, originalGraph));
  for (const path of audit.removed) originalGraph.renameable.delete(path);
  warnings.push(...originalGraph.warnings, ...audit.warnings);

  const rewrittenAssets: Asset[] = optimized.map((file) => {
    const asset = surviving.find((a) => a.path === file.path)!;
    return { ...asset, bytes: file.bytes };
  });
  const graph = buildGraph(rewrittenAssets);
  // Permission comes from the original graph: minification can only lose
  // references (a minifier may drop a comment holding one), never gain them, so
  // intersecting is the safe direction.
  for (const path of [...graph.renameable]) {
    if (!originalGraph.renameable.has(path)) graph.renameable.delete(path);
  }

  // 3. Decide new names.
  const renamed = new Map<string, string>();
  if (folder.hash) {
    for (const file of optimized) {
      if (!graph.renameable.has(file.path)) continue;
      renamed.set(file.path, hashedPath(file.path, await contentHash(file.bytes)));
    }
  }

  // 4. Rewrite addresses in pages and stylesheets.
  const perFile = refsByFile(graph.refs);
  let rewritten = 0;

  const files = optimized.map((file): FolderFile => {
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
  };
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
      mime: asset ? mimeOf(asset) : 'application/octet-stream',
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
