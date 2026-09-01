import * as Comlink from 'comlink';
import { fromText, union, withSafetyFloor } from '../lib/codepoints';
import { resolveWidths, scaledHeight } from '../lib/ladder';
import { stripMetadata } from '../lib/metadata';
import { compressedPath, fontSlicePath, splitPath, variantPath } from '../lib/naming';
import {
  coveredCodepoints,
  decodeWoff,
  detectContainer,
  familyName,
  fontStyle,
} from '../lib/sfnt';
import { auditWithDomParser, type Graph } from '../lib/graph';
import { formatUnicodeRange, partition } from '../lib/unicode-ranges';
import type { FontSettings, ImageSettings, OutputFormat, TextSettings } from '../lib/settings';
import type { Asset } from '../lib/types';
import type {
  FontOutcome,
  FontSlice,
  ImageOutcome,
  TextKind,
  TextOutcome,
  Variant,
} from '../lib/types';
import { fromWoff2, subsetFont, toWoff2 } from './font-codecs';
import {
  brotli,
  bundleModule,
  gzip,
  minifyCss,
  minifyHtml,
  minifyJs,
  minifySvg,
  squeezeJs,
} from './text-codecs';
import {
  decode,
  encodeAvif,
  encodeJpeg,
  encodePng,
  encodeWebp,
  placeholder,
  resize,
} from './codecs';

/**
 * The one worker type in the pool. It inspects files and, for images, runs the
 * whole decode -> resize -> encode -> hash pipeline.
 *
 * Nothing here runs on the main thread and nothing here throws across the Comlink
 * boundary. Every failure becomes a `skipped` reason or a warning in plain
 * language, so one unreadable file cannot take down a run of five hundred.
 */

export type Inspection = {
  width?: number;
  height?: number;
  /** Size after gzip - roughly what a correctly configured server would send. */
  gzipBytes: number;
  rawBytes: number;
};

type Progress = (ratio: number, label: string) => void;

async function gzipSize(bytes: Uint8Array): Promise<number> {
  if (typeof CompressionStream === 'undefined') return bytes.byteLength;
  const stream = new Blob([bytes as BufferSource])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

async function dimensions(bytes: Uint8Array, mime: string) {
  if (typeof createImageBitmap === 'undefined') return {};
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BufferSource], { type: mime }));
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return {};
  }
}

/** The safe output format: stay in the source's own family. */
function fallbackMime(sourceMime: string): string {
  if (sourceMime === 'image/png' || sourceMime === 'image/gif') return 'image/png';
  return 'image/jpeg';
}

async function encodeOne(
  data: ImageData,
  format: OutputFormat,
  mime: string,
  quality: number,
): Promise<Uint8Array> {
  if (format === 'avif') return encodeAvif(data, quality);
  if (format === 'webp') return encodeWebp(data, quality);
  return mime === 'image/png' ? encodePng(data) : encodeJpeg(data, quality);
}

const formatLabel = (f: OutputFormat) => (f === 'fallback' ? 'original format' : f.toUpperCase());


/* ------------------------------------------------------------------ *
 * Phase 2 - fonts
 * ------------------------------------------------------------------ */

async function toSfnt(bytes: Uint8Array, container: string): Promise<Uint8Array> {
  if (container === 'woff') return decodeWoff(bytes);
  if (container === 'woff2') return fromWoff2(bytes);
  return bytes;
}

async function optimizeFont(
  path: string,
  bytes: Uint8Array,
  settings: FontSettings,
  used: number[],
  onProgress: Progress,
): Promise<FontOutcome> {
  const base: FontOutcome = {
    inputPath: path,
    bytesBefore: bytes.byteLength,
    family: splitPath(path).stem,
    weight: 400,
    italic: false,
    container: 'unknown',
    codepointsBefore: 0,
    codepointsAfter: 0,
    slices: [],
    bytesServed: bytes.byteLength,
    warnings: [],
  };

  const container = detectContainer(bytes);
  if (!container) {
    return { ...base, skipped: 'This does not look like a font file. It was copied unchanged.' };
  }
  base.container = container;

  onProgress(0.1, 'Unpacking ' + container.toUpperCase());
  let sfnt: Uint8Array;
  try {
    sfnt = await toSfnt(bytes, container);
  } catch {
    return {
      ...base,
      skipped: 'Could not unpack this font - the file may be damaged. It was copied unchanged.',
    };
  }

  base.family = familyName(sfnt) ?? base.family;
  const style = fontStyle(sfnt);
  base.weight = style.weight;
  base.italic = style.italic;

  const covered = coveredCodepoints(sfnt);
  base.codepointsBefore = covered.size;
  if (covered.size === 0) {
    return {
      ...base,
      skipped: 'Could not read which characters this font contains, so nothing was changed.',
    };
  }

  // Work out what each emitted file should hold before encoding anything.
  type Plan = { name: string; slug: string; codepoints: number[] | undefined };
  let plans: Plan[];

  if (settings.mode === 'keep') {
    plans = [{ name: 'whole font', slug: '', codepoints: undefined }];
  } else if (settings.mode === 'split') {
    plans = partition(covered).map((b) => ({
      name: b.name,
      slug: b.name,
      codepoints: b.codepoints,
    }));
  } else {
    const wanted = withSafetyFloor(union([new Set(used), fromText(settings.extraText)]));
    const keep = [...wanted].filter((cp) => covered.has(cp));
    if (keep.length === 0) {
      return {
        ...base,
        skipped:
          'None of the characters found on your pages are in this font, so nothing was removed. Drop your HTML or CSS in alongside the font, or paste your text in, and try again.',
      };
    }
    base.warnings.push(
      'Kept ' +
        keep.length +
        ' of ' +
        covered.size +
        ' characters, based on the text you supplied. Any character your pages produce later - from a database, a form, or JavaScript - will not be in this font. Use range splitting instead if you are not certain.',
    );
    plans = [{ name: 'subset', slug: 'subset', codepoints: keep }];
  }

  const slices: FontSlice[] = [];
  for (const [i, plan] of plans.entries()) {
    onProgress(0.2 + (0.75 * i) / plans.length, plan.name);
    try {
      const sliced = plan.codepoints ? await subsetFont(sfnt, plan.codepoints) : sfnt;
      const woff2 = await toWoff2(sliced);
      slices.push({
        name: plan.name,
        path: fontSlicePath(path, plan.slug),
        bytes: woff2,
        codepoints: plan.codepoints?.length ?? covered.size,
        unicodeRange: plan.codepoints ? formatUnicodeRange(plan.codepoints) : '',
      });
    } catch {
      base.warnings.push(
        'Could not build the ' +
          plan.name +
          ' file for this font. That part was skipped; the rest was kept.',
      );
    }
  }

  if (slices.length === 0) {
    return { ...base, skipped: 'Nothing could be built from this font. It was copied unchanged.' };
  }

  onProgress(1, 'Done');
  return {
    ...base,
    slices,
    codepointsAfter: slices.reduce((n, s) => n + s.codepoints, 0),
    // Ranges come out in priority order, so the first slice is what a
    // Latin-script page downloads. The rest are fetched only when needed.
    bytesServed: slices[0]!.bytes.byteLength,
  };
}

/* ------------------------------------------------------------------ *
 * Phase 3 - text
 * ------------------------------------------------------------------ */

async function minifyByKind(
  source: string,
  kind: TextKind,
  path: string,
  settings: TextSettings,
): Promise<string | undefined> {
  if (kind === 'css') return settings.css ? minifyCss(source, path, settings.target) : undefined;

  if (kind === 'js') {
    if (!settings.js) return undefined;
    const first = await minifyJs(source);
    if (!settings.deeper) return first.code;
    // A failed second pass is not a failed minification: keep the first result.
    try {
      const twice = await squeezeJs(first.code, first.module);
      return twice.length < first.code.length ? twice : first.code;
    } catch {
      return first.code;
    }
  }

  if (kind === 'html') return settings.html ? minifyHtml(source, settings.target) : undefined;
  return settings.svg ? minifySvg(source, path) : undefined;
}

async function optimizeText(
  path: string,
  kind: TextKind,
  bytes: Uint8Array,
  settings: TextSettings,
  onProgress: Progress,
): Promise<TextOutcome> {
  const base: TextOutcome = {
    inputPath: path,
    kind,
    bytesBefore: bytes.byteLength,
    bytesAfter: bytes.byteLength,
    minified: bytes,
    siblings: [],
    bytesTransport: bytes.byteLength,
    warnings: [],
  };

  const encoder = new TextEncoder();
  onProgress(0.1, 'Minifying');

  let output = bytes;
  let skipped: string | undefined;

  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const minified = await minifyByKind(source, kind, path, settings);

    if (minified === undefined) {
      skipped = 'Minifying ' + kind.toUpperCase() + ' is turned off, so this was copied unchanged.';
    } else {
      const candidate = encoder.encode(minified);
      if (candidate.byteLength >= bytes.byteLength) {
        // Already minified, or too small to gain. Never ship a bigger file.
        skipped = 'Already as small as it gets - the original was kept.';
      } else {
        output = candidate;
      }
    }
  } catch {
    skipped =
      'Could not read this file as text, so it was copied unchanged. It may use an unusual encoding, or contain a syntax error.';
  }

  base.minified = output;
  base.bytesAfter = output.byteLength;
  base.skipped = skipped;

  onProgress(0.6, 'Compressing');
  let smallest = output.byteLength;

  if (settings.gzip) {
    try {
      const gz = await gzip(output);
      base.siblings.push({ path: compressedPath(path, 'gzip'), bytes: gz, encoding: 'gzip' });
      smallest = Math.min(smallest, gz.byteLength);
    } catch {
      base.warnings.push('Could not build the gzip copy of this file.');
    }
  }

  if (settings.brotli) {
    try {
      const br = await brotli(output);
      base.siblings.push({ path: compressedPath(path, 'brotli'), bytes: br, encoding: 'brotli' });
      smallest = Math.min(smallest, br.byteLength);
    } catch {
      base.warnings.push('Could not build the brotli copy of this file.');
    }
  }

  base.bytesTransport = smallest;
  onProgress(1, 'Done');
  return base;
}

/* ------------------------------------------------------------------ *
 * Phase 4 - folder mode
 * ------------------------------------------------------------------ */

/**
 * Re-encode an image into its own format, at its own size.
 *
 * Folder mode deliberately does not turn an <img> into a <picture>. That would
 * mean AVIF and WebP, which is a much bigger saving - but it also reparents the
 * <img>, and a stylesheet written against `.gallery > img` stops matching. Law 2
 * forbids removing nodes and the spirit of it forbids silently restructuring
 * them, so folder mode changes bytes and never markup. The <picture> route stays
 * where it was in Phase 1: a snippet the user pastes in knowingly.
 */
async function reencodeImage(
  mime: string,
  bytes: Uint8Array,
  quality: number,
  stripFirst: boolean,
): Promise<{ bytes: Uint8Array; skipped?: string; warnings: string[] }> {
  const warnings: string[] = [];

  let source: ImageData;
  try {
    source = await decode(bytes, mime);
  } catch {
    return {
      bytes,
      skipped: 'Could not read this image, so it was copied unchanged.',
      warnings,
    };
  }

  let encoded: Uint8Array;
  try {
    if (mime === 'image/png') encoded = await encodePng(source);
    else if (mime === 'image/webp') encoded = await encodeWebp(source, quality);
    else if (mime === 'image/avif') encoded = await encodeAvif(source, quality);
    else if (mime === 'image/jpeg') encoded = await encodeJpeg(source, quality);
    else {
      // GIF and anything else: re-encoding would change the format, and folder
      // mode does not change formats.
      return { bytes, skipped: 'This format is copied through unchanged.', warnings };
    }
  } catch {
    return { bytes, skipped: 'This image could not be re-encoded, so it was left alone.', warnings };
  }

  if (encoded.byteLength >= bytes.byteLength) {
    // Law 5: a bigger file is not a saving. Fall back to stripping metadata.
    const stripped = stripFirst ? stripMetadata(bytes, mime) : { bytes, removed: 0 };
    return {
      bytes: stripped.bytes,
      skipped:
        stripped.removed > 0
          ? 'Re-encoding made this bigger, so the original was kept with its camera metadata removed.'
          : 'Already as small as it gets - the original was kept.',
      warnings,
    };
  }

  return { bytes: encoded, warnings };
}

const api = {
  async inspect(bytes: Uint8Array, mime: string, kind: string): Promise<Inspection> {
    const dims = kind === 'image' ? await dimensions(bytes, mime) : {};
    return { ...dims, gzipBytes: await gzipSize(bytes), rawBytes: bytes.byteLength };
  },

  async optimizeImage(
    path: string,
    mime: string,
    bytes: Uint8Array,
    settings: ImageSettings,
    onProgress: Progress,
  ): Promise<ImageOutcome> {
    const base: ImageOutcome = {
      inputPath: path,
      bytesBefore: bytes.byteLength,
      naturalWidth: 0,
      naturalHeight: 0,
      variants: [],
      metadataRemoved: 0,
      warnings: [],
    };

    onProgress(0.05, 'Decoding');
    let source: ImageData;
    try {
      source = await decode(bytes, mime);
    } catch {
      return {
        ...base,
        skipped:
          'Could not read this file - it may be damaged, or use a format this browser cannot decode. It was copied unchanged.',
      };
    }

    base.naturalWidth = source.width;
    base.naturalHeight = source.height;

    if (mime === 'image/gif') {
      // Only the first frame is decoded. Saying nothing here would report an
      // animation turning into a still picture as a straight saving.
      base.warnings.push(
        'This is a GIF and only its first frame was used, so the output does not animate. The original is still in your own folder, untouched.',
      );
    }

    const widths = resolveWidths(settings.widths, source.width);
    if (widths.length === 0) {
      return { ...base, skipped: 'Too small to be worth resizing. It was copied unchanged.' };
    }

    const formats = (['avif', 'webp', 'fallback'] as const).filter((f) => settings.formats[f]);
    if (formats.length === 0) {
      return { ...base, skipped: 'No output formats are turned on.' };
    }

    const fbMime = fallbackMime(mime);
    const total = widths.length * formats.length;
    const variants: Variant[] = [];
    let done = 0;

    for (const width of widths) {
      const height = scaledHeight(source.width, source.height, width);
      let scaled: ImageData;
      try {
        scaled = width === source.width ? source : await resize(source, width, height);
      } catch {
        base.warnings.push('Could not resize to ' + width + 'px. That width was skipped.');
        done += formats.length;
        continue;
      }

      for (const format of formats) {
        const outMime = format === 'fallback' ? fbMime : 'image/' + format;
        onProgress(done / total, formatLabel(format) + ' at ' + width + 'px');
        try {
          const encoded = await encodeOne(scaled, format, outMime, settings.quality[format]);
          variants.push({
            format,
            mime: outMime,
            width,
            height,
            path: variantPath(path, width, outMime),
            bytes: encoded,
          });
        } catch {
          base.warnings.push(
            'The ' +
              formatLabel(format) +
              ' encoder could not handle this image at ' +
              width +
              'px. That one output was skipped; the others were kept.',
          );
        }
        done++;
      }
    }

    if (variants.length === 0) {
      return { ...base, skipped: 'Nothing could be encoded from this file. It was copied unchanged.' };
    }

    // Law 5: an "optimized" file that is bigger than the original is not a saving.
    // Keep the original bytes instead, metadata-stripped, and say so out loud.
    const fullSize = variants.find((v) => v.format === 'fallback' && v.width === source.width);
    if (fullSize && fullSize.bytes.byteLength >= bytes.byteLength) {
      const stripped = settings.stripMetadata
        ? stripMetadata(bytes, mime)
        : { bytes, removed: 0 };
      fullSize.bytes = stripped.bytes;
      fullSize.mime = mime;
      fullSize.path = variantPath(path, source.width, mime);
      base.metadataRemoved = stripped.removed;
      base.warnings.push(
        'Re-encoding at full size made this file bigger, so the original was kept' +
          (stripped.removed > 0 ? ' with its camera metadata removed.' : '.'),
      );
    }

    if (settings.thumbhash) {
      onProgress(0.95, 'Placeholder');
      try {
        base.placeholder = await placeholder(source);
      } catch {
        base.warnings.push('Could not build a placeholder for this image. Everything else was kept.');
      }
    }

    onProgress(1, 'Done');
    return { ...base, variants };
  },

  optimizeFont,
  optimizeText,
  reencodeImage,
  bundleModule,

  /**
   * Read a page the way a browser will and report any address the scanner could
   * not place. Runs here because DOMParser is a browser API.
   */
  auditGraph(assets: Asset[], graph: Graph) {
    const result = auditWithDomParser(assets, graph);
    // `renameable` is a Set, which Comlink cannot return by reference; hand back
    // the removals and let the caller apply them.
    return { removed: result.removed, warnings: result.warnings };
  },

  /** Characters used in one of the text files the user dropped in. */
  scanCodepoints(bytes: Uint8Array): number[] {
    return [...fromText(new TextDecoder('utf-8', { fatal: false }).decode(bytes))];
  },
};

export type PipelineApi = typeof api;

Comlink.expose(api);
