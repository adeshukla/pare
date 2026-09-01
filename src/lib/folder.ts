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
};

export const FOLDER_DEFAULTS: FolderSettings = { hash: true, images: true, text: true };

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

  // 1. Optimize each file's bytes, in place and in its own format.
  const optimized = await runAll(assets, async (asset, api): Promise<FolderFile> => {
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
  const originalGraph = buildGraph(assets);
  const audit = await run((api) => api.auditGraph(assets, originalGraph));
  for (const path of audit.removed) originalGraph.renameable.delete(path);
  warnings.push(...originalGraph.warnings, ...audit.warnings);

  const rewrittenAssets: Asset[] = optimized.map((file) => {
    const asset = assets.find((a) => a.path === file.path)!;
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

  return { files, graph, renamed, warnings, rewritten, pages: graph.entries };
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
