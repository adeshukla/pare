import * as Comlink from 'comlink';
import { fromText, union, withSafetyFloor } from '../lib/codepoints';
import { resolveWidths, scaledHeight } from '../lib/ladder';
import { isAnimatedGif, stripMetadata } from '../lib/metadata';
import { compressedPath, fontSlicePath, splitPath, variantPath } from '../lib/naming';
import {
  coveredCodepoints,
  decodeWoff,
  encodeWoff,
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
  minifyCssMapped,
  minifyHtml,
  minifyJs,
  minifySvg,
  squeezeJsMapped,
} from './text-codecs';
import {
  decode,
  decodeScaled,
  warmEncoders,
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
  // Lossless sources stay lossless. A BMP is usually a screenshot or a graphic,
  // and PNG keeps it exact; a HEIC is a photograph, and JPEG is its universal form.
  if (sourceMime === 'image/png' || sourceMime === 'image/gif' || sourceMime === 'image/bmp') {
    return 'image/png';
  }
  return 'image/jpeg';
}

/** Formats every browser can display, so the original may stand in as the fallback. */
const WEB_DISPLAYABLE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

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

/** Copy a rectangle out of an image. */
function crop(data: ImageData, x: number, y: number, width: number, height: number): ImageData {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * data.width + x) * 4;
    out.set(data.data.subarray(from, from + width * 4), row * width * 4);
  }
  return new ImageData(out, width, height);
}

/**
 * The one size a "single" output asks for. Never enlarges: a box bigger than
 * the image gives the image back (cropped to the box's shape for "cover").
 */
async function singleSize(
  source: ImageData,
  box: ImageSettings['single'],
): Promise<ImageData> {
  const { width: w, height: h, fit } = box;
  if (!w && !h) return source;

  if (fit === 'cover' && w && h) {
    // The largest centred region with the box's shape...
    const aspect = w / h;
    let cw = source.width;
    let ch = Math.round(cw / aspect);
    if (ch > source.height) {
      ch = source.height;
      cw = Math.round(ch * aspect);
    }
    const cropped =
      cw === source.width && ch === source.height
        ? source
        : crop(source, Math.floor((source.width - cw) / 2), Math.floor((source.height - ch) / 2), cw, ch);
    // ...then down to the box, unless it is already smaller.
    return cw > w ? resize(cropped, w, h) : cropped;
  }

  const scale = Math.min(w ? w / source.width : Infinity, h ? h / source.height : Infinity, 1);
  if (scale >= 1) return source;
  const tw = Math.max(1, Math.round(source.width * scale));
  return resize(source, tw, scaledHeight(source.width, source.height, tw));
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
      const woff = settings.woff
        ? { path: fontSlicePath(path, plan.slug, 'woff'), bytes: await encodeWoff(sliced) }
        : undefined;
      slices.push({
        woff,
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

type MinifiedText = { code: string; map?: string; note?: string };

async function minifyByKind(
  source: string,
  kind: TextKind,
  path: string,
  settings: TextSettings,
): Promise<MinifiedText | undefined> {
  if (kind === 'css') {
    return settings.css ? minifyCssMapped(source, path, settings.target, settings.sourceMaps) : undefined;
  }

  if (kind === 'js') {
    if (!settings.js) return undefined;
    const first = await minifyJs(source, {
      level: settings.jsLevel,
      preset: settings.target,
      sourceMap: settings.sourceMaps,
      filename: path,
    });
    const note = first.kept
      ? 'Kept every variable name in this file, because it uses ' +
        first.kept +
        ', which depends on them. It was still minified.'
      : undefined;
    if (settings.jsLevel !== 'max' || first.kept) return { code: first.code, map: first.map, note };
    // A failed second pass is not a failed minification: keep the first result.
    try {
      const twice = await squeezeJsMapped(first.code, first.module, settings.target, first.map, path);
      return twice.code.length < first.code.length ? twice : { code: first.code, map: first.map };
    } catch {
      return { code: first.code, map: first.map };
    }
  }

  if (kind === 'html') {
    return settings.html ? { code: await minifyHtml(source, settings.target, settings.jsLevel) } : undefined;
  }
  return settings.svg ? { code: await minifySvg(source, path) } : undefined;
}

/** The comment that points a browser's dev tools at a map, in each language. */
function mapComment(kind: TextKind, mapPath: string): string {
  const name = mapPath.slice(mapPath.lastIndexOf('/') + 1);
  return kind === 'css' ? `\n/*# sourceMappingURL=${name} */` : `\n//# sourceMappingURL=${name}`;
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
      if (minified.note) base.warnings.push(minified.note);
      const mapPath = path + '.map';
      const code = minified.map ? minified.code + mapComment(kind, mapPath) : minified.code;
      const candidate = encoder.encode(code);
      if (candidate.byteLength >= bytes.byteLength) {
        // Already minified, or too small to gain. Never ship a bigger file.
        skipped = 'Already as small as it gets - the original was kept.';
      } else {
        output = candidate;
        if (minified.map) base.map = { path: mapPath, bytes: encoder.encode(minified.map) };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    skipped = /not supported yet|configured target environment/i.test(message)
      ? 'This file uses JavaScript newer than the browsers you chose can run, and it cannot be rewritten for them, so it was copied unchanged. Choose a newer browser range to minify it.'
      : 'Could not read this file as text, so it was copied unchanged. It may use an unusual encoding, or contain a syntax error.';
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

type Reencoded = {
  bytes: Uint8Array;
  skipped?: string;
  warnings: string[];
  /** Same pixels as AVIF / WebP, kept only when smaller than `bytes`. */
  avif?: Uint8Array;
  webp?: Uint8Array;
  /** Set when the image was scaled down to the size it is shown at (ADR-030). */
  resized?: { from: number; to: number };
};

/**
 * Re-encode an image into its own format, at its own size - and, when asked,
 * also into AVIF and WebP at that same size.
 *
 * The in-place re-encode changes bytes and never markup. The modern copies only
 * matter if folder mode then wraps an `<img>` in a `<picture>`, which is opt-in
 * and fenced (ADR-021); this function just makes the files. Making them here
 * reuses the one decode rather than paying for a second.
 */
async function reencodeImage(
  mime: string,
  bytes: Uint8Array,
  quality: number,
  stripFirst: boolean,
  modern?: { avif: number; webp: number },
  onProgress: Progress = () => {},
  maxWidth?: number,
): Promise<Reencoded> {
  const out = await reencodeInPlace(mime, bytes, quality, stripFirst, onProgress, maxWidth);
  if (!modern || out.source === undefined) return out.result;
  if (mime !== 'image/jpeg' && mime !== 'image/png') return out.result;

  const baseline = out.result.bytes.byteLength;
  const result = out.result;
  try {
    onProgress(0.5, 'AVIF copy');
    const avif = await encodeAvif(out.source, modern.avif);
    if (avif.byteLength < baseline) result.avif = avif;
  } catch {
    result.warnings.push('Could not make an AVIF copy of this image. The others were kept.');
  }
  try {
    onProgress(0.8, 'WebP copy');
    const webp = await encodeWebp(out.source, modern.webp);
    if (webp.byteLength < baseline) result.webp = webp;
  } catch {
    result.warnings.push('Could not make a WebP copy of this image. The others were kept.');
  }
  return result;
}

async function reencodeInPlace(
  mime: string,
  bytes: Uint8Array,
  quality: number,
  stripFirst: boolean,
  onProgress: Progress,
  maxWidth?: number,
): Promise<{ result: Reencoded; source?: ImageData }> {
  const warnings: string[] = [];

  onProgress(0.05, 'Decoding');
  let source: ImageData;
  try {
    source = await decode(bytes, mime);
  } catch {
    return {
      result: {
        bytes,
        skipped: 'Could not read this image, so it was copied unchanged.',
        warnings,
      },
    };
  }

  let resized: Reencoded['resized'];
  if (maxWidth && source.width > maxWidth && mime !== 'image/gif') {
    onProgress(0.15, 'Resizing to ' + maxWidth + 'px');
    try {
      const from = source.width;
      source = await resize(source, maxWidth, scaledHeight(source.width, source.height, maxWidth));
      resized = { from, to: maxWidth };
    } catch {
      warnings.push('Could not resize this image, so it was re-encoded at its full size.');
    }
  }

  onProgress(0.2, 'Re-encoding');
  const result = await encodeSameFormat(source, mime, bytes, quality, stripFirst, warnings);
  // Only claim the resize if the resized bytes are what ships.
  if (resized && result.bytes !== bytes && !result.skipped) result.resized = resized;
  return { result, source };
}

async function encodeSameFormat(
  source: ImageData,
  mime: string,
  bytes: Uint8Array,
  quality: number,
  stripFirst: boolean,
  warnings: string[],
): Promise<Reencoded> {
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

/** The width a quality preview is measured at, or the image's own if smaller. */
const PREVIEW_WIDTH = 800;

/** One decoded, scaled sample per worker, so dragging a slider only re-encodes. */
let previewSource: { key: string; data: ImageData } | undefined;

const api = {
  /**
   * Bytes one format and quality would produce for one sample image, so the
   * slider can show its cost before anything runs. Undefined if the sample will
   * not decode; the slider just shows nothing then.
   */
  async previewSize(
    key: string,
    mime: string,
    bytes: Uint8Array,
    format: OutputFormat,
    quality: number,
  ): Promise<{ bytes: number; width: number } | undefined> {
    try {
      if (previewSource?.key !== key) {
        const full = await decode(bytes, mime);
        const width = Math.min(PREVIEW_WIDTH, full.width);
        const data =
          width === full.width
            ? full
            : await resize(full, width, scaledHeight(full.width, full.height, width));
        previewSource = { key, data };
      }
      const data = previewSource.data;
      const encoded = await encodeOne(data, format, fallbackMime(mime), quality);
      return { bytes: encoded.byteLength, width: data.width };
    } catch {
      return undefined;
    }
  },

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

    if (mime === 'image/gif' && isAnimatedGif(bytes)) {
      // Only a first frame could come out, and a still picture is a different
      // file, not a smaller one. Leave the animation alone.
      return {
        ...base,
        skipped:
          'This GIF is animated. Pare cannot make an animated AVIF or WebP, and a still image would lose the animation, so it was copied unchanged.',
      };
    }

    onProgress(0.05, 'Decoding');
    let source: ImageData;
    try {
      source = await decode(bytes, mime);
    } catch {
      // Perhaps too big to hold in memory at full size. Downscale while
      // decoding and try once more before giving up (ARCHITECTURE.md).
      const largest = Math.max(...settings.widths);
      try {
        source = await decodeScaled(bytes, mime, largest);
        base.warnings.push(
          'This image was too large to work on at full size, so it was scaled to ' +
            largest +
            'px wide while reading it. The largest file made is that width, not the original.',
        );
      } catch {
        return {
          ...base,
          skipped:
            'Could not read this file - it may be damaged, too large for this browser tab, or use a format this browser cannot decode. It was copied unchanged.',
        };
      }
    }

    base.naturalWidth = source.width;
    base.naturalHeight = source.height;

    // One size instead of a ladder: scale (and for "cover", crop) once, then
    // the ladder below runs with exactly that width.
    if (settings.output === 'single') {
      const sized = await singleSize(source, settings.single);
      if (sized !== source) {
        source = sized;
        base.naturalWidth = source.width;
        base.naturalHeight = source.height;
      }
    }

    const all =
      settings.output === 'single' ? [source.width] : resolveWidths(settings.widths, source.width);
    if (all.length === 0) {
      return { ...base, skipped: 'Too small to be worth resizing. It was copied unchanged.' };
    }
    // This job's share of the widths: largest first, dealt round-robin, so the
    // slowest encodes land on different workers.
    const slice = settings.slice;
    const widths = slice
      ? [...all].reverse().filter((_, i) => i % slice.count === slice.index).reverse()
      : all;
    if (widths.length === 0) return { ...base, empty: true };

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
    // Never for HEIC or BMP: "keeping the original" would hand most browsers a
    // file they cannot show (HEIC) or a needlessly huge one (BMP).
    const fullSize = variants.find((v) => v.format === 'fallback' && v.width === source.width);
    if (
      fullSize &&
      fullSize.bytes.byteLength >= bytes.byteLength &&
      WEB_DISPLAYABLE.has(mime) &&
      // A one-size output is a different picture from the original; never swap it back.
      settings.output !== 'single'
    ) {
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

  /** Load encoders now, so the run that follows does not wait for them. */
  warm(kinds: string[]): Promise<void> {
    return warmEncoders(kinds);
  },

  /**
   * BMP to PNG, for whole-site mode (ADR-026). Lossless both ways, so the page
   * looks exactly as it did; the file just stops being uncompressed.
   */
  async bmpToPng(bytes: Uint8Array): Promise<{ bytes?: Uint8Array; skipped?: string }> {
    try {
      const source = await decode(bytes, 'image/bmp');
      const png = await encodePng(source);
      if (png.byteLength >= bytes.byteLength) return { skipped: 'Already as small as it gets - the original was kept.' };
      return { bytes: png };
    } catch {
      return { skipped: 'Could not read this BMP, so it was copied unchanged.' };
    }
  },
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
