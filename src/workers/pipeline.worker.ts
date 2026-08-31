import * as Comlink from 'comlink';
import { resolveWidths, scaledHeight } from '../lib/ladder';
import { stripMetadata } from '../lib/metadata';
import { variantPath } from '../lib/naming';
import type { ImageSettings, OutputFormat } from '../lib/settings';
import type { ImageOutcome, Variant } from '../lib/types';
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
};

export type PipelineApi = typeof api;

Comlink.expose(api);
