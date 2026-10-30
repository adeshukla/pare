import * as Comlink from 'comlink';
import { bytes } from './format';
import { hasGpsLocation, isAnimatedGif } from './metadata';
import { ICON_SNIPPET } from './icons';
import { needsFor } from './needs';
import { poolSize, runAll } from './pool';
import { defaultImgWidth } from './ladder';
import { fontFaceSnippet } from './font-snippet';
import { pictureSnippet } from './snippet';
import type { FontSettings, ImageSettings, OutputFormat, TextSettings } from './settings';
import type { Asset, FontOutcome, ImageOutcome, TextKind, TextOutcome, Variant } from './types';
import type { Inspection } from '../workers/pipeline.worker';

export type Settings = {
  image: ImageSettings;
  font: FontSettings;
  text: TextSettings;
};

/** Asset kinds the text pipeline handles, and that the font scanner reads. */
const TEXT_KINDS = new Set<Asset['kind']>(['css', 'js', 'html', 'svg', 'json', 'xml']);
export const isTextKind = (kind: Asset['kind']): kind is TextKind => TEXT_KINDS.has(kind);

/** One input file and everything we learned about it. */
export type Row = {
  asset: Asset;
  state: 'queued' | 'running' | 'done';
  /** 0-1. Updated from inside the worker so nothing runs silently. */
  progress: number;
  label: string;
  outcome?: ImageOutcome;
  font?: FontOutcome;
  text?: TextOutcome;
  inspection?: Inspection;
  snippet?: string;
};

export const newRow = (asset: Asset): Row => ({
  asset,
  state: 'queued',
  progress: 0,
  label: '',
});

/**
 * The file a browser actually downloads at full width: the smallest full-size
 * variant, since `<picture>` picks the first type it can decode and AVIF is first.
 *
 * This is the number the savings headline is built from. Summing every emitted
 * file instead would be dishonest in the other direction - nobody downloads all
 * nine of them.
 */
export function servedVariant(outcome: ImageOutcome): Variant | undefined {
  const full = outcome.variants.filter((v) => v.width === outcome.naturalWidth);
  if (full.length === 0) return undefined;
  return full.reduce((best, v) => (v.bytes.byteLength < best.bytes.byteLength ? v : best));
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

export type ReportKind = 'image' | 'font' | 'css' | 'js' | 'html' | 'svg' | 'json' | 'xml';

export const REPORT_LABEL: Record<ReportKind, string> = {
  image: 'Images',
  font: 'Fonts',
  css: 'CSS',
  js: 'JavaScript',
  html: 'HTML',
  svg: 'SVG',
  json: 'JSON',
  xml: 'XML',
};

export type KindLine = {
  kind: ReportKind;
  count: number;
  before: number;
  /** What a visitor downloads from the files you save, as they are. */
  served: number;
  /** Code only: what a server would send if it compressed the file. An estimate; the saved file is not this size. */
  compressed: number;
  /** Every file emitted for this kind. */
  emitted: number;
  skipped: number;
};

export type Report = {
  files: number;
  lines: KindLine[];
  bytesBefore: number;
  bytesServed: number;
  /** `bytesServed` with code counted at its compressed size - what a server that compresses would send. */
  bytesCompressed: number;
  bytesEmitted: number;
  skipped: number;
  warnings: number;
  metadataRemoved: number;
  /** Photos that carried a GPS position and whose output does not. */
  locationsRemoved: number;
};

/** before, after, and the one-line detail shown under the file name. */
export function measure(row: Row): { before: number; after?: number; detail: string } {
  const image = row.outcome;
  if (image) {
    return {
      before: image.bytesBefore,
      after: image.skipped ? image.bytesBefore : servedVariant(image)?.bytes.byteLength,
      detail: image.naturalWidth > 0 ? image.naturalWidth + '×' + image.naturalHeight : '',
    };
  }

  const font = row.font;
  if (font) {
    const detail = font.skipped
      ? font.container.toUpperCase()
      : font.slices.length > 1
        ? font.slices.length + ' files · ' + font.codepointsAfter + ' characters'
        : font.codepointsAfter + ' of ' + font.codepointsBefore + ' characters';
    return { before: font.bytesBefore, after: font.skipped ? font.bytesBefore : font.bytesServed, detail };
  }

  const text = row.text;
  if (text) {
    // "After" is the file Save gives you. The compressed copies are separate
    // files, and a browser only receives them if the server is set up to send them.
    const encodings = text.siblings.map((s) => (s.encoding === 'gzip' ? 'gzip' : 'brotli'));
    const detail =
      encodings.length > 0 && text.bytesTransport < text.bytesAfter
        ? `${bytes(text.bytesTransport)} once a server compresses it (${encodings.join(' + ')} copies are in the zip)`
        : text.skipped
          ? ''
          : 'minified';
    return { before: text.bytesBefore, after: text.bytesAfter, detail };
  }

  const raw = row.inspection?.rawBytes ?? row.asset.bytes.byteLength;
  // Until the run finishes nothing has been copied anywhere yet; saying so early
  // would describe an outcome that has not happened.
  return { before: raw, after: undefined, detail: row.state === 'done' ? 'copied unchanged' : '' };
}

/**
 * True when the photo carried a GPS position and nothing Pare made from it
 * does - checked on the output bytes themselves, not assumed from a setting.
 */
export function locationRemoved(row: Row): boolean {
  const image = row.outcome;
  if (row.state !== 'done' || !image || image.skipped || image.variants.length === 0) return false;
  return hasGpsLocation(row.asset.bytes) && image.variants.every((v) => !hasGpsLocation(v.bytes));
}

function blank(kind: ReportKind): KindLine {
  return { kind, count: 0, before: 0, served: 0, compressed: 0, emitted: 0, skipped: 0 };
}

export function summarise(rows: Row[]): Report {
  const lines = new Map<ReportKind, KindLine>();
  const line = (kind: ReportKind) => {
    const existing = lines.get(kind) ?? blank(kind);
    lines.set(kind, existing);
    return existing;
  };

  let warnings = 0;
  let metadataRemoved = 0;
  let locationsRemoved = 0;

  for (const row of rows) {
    if (row.outcome) {
      const outcome = row.outcome;
      const l = line('image');
      l.count++;
      l.before += outcome.bytesBefore;
      warnings += outcome.warnings.length;
      metadataRemoved += outcome.metadataRemoved;
      if (locationRemoved(row)) locationsRemoved++;

      if (outcome.skipped) {
        l.skipped++;
        // A skipped file is copied through unchanged, so it costs what it cost.
        l.served += outcome.bytesBefore;
        l.emitted += outcome.bytesBefore;
      } else {
        l.served += servedVariant(outcome)?.bytes.byteLength ?? outcome.bytesBefore;
        for (const v of outcome.variants) l.emitted += v.bytes.byteLength;
      }
    }

    if (row.font) {
      const font = row.font;
      const l = line('font');
      l.count++;
      l.before += font.bytesBefore;
      warnings += font.warnings.length;

      if (font.skipped) {
        l.skipped++;
        l.served += font.bytesBefore;
        l.emitted += font.bytesBefore;
      } else {
        l.served += font.bytesServed;
        for (const s of font.slices) l.emitted += s.bytes.byteLength + (s.woff?.bytes.byteLength ?? 0);
      }
    }

    if (row.text) {
      const text = row.text;
      const l = line(text.kind);
      l.count++;
      l.before += text.bytesBefore;
      warnings += text.warnings.length;
      if (text.skipped) l.skipped++;
      // The saved file is what a visitor gets unless a server compresses it.
      l.served += text.bytesAfter;
      l.compressed += text.bytesTransport;
      l.emitted +=
        text.bytesAfter +
        text.siblings.reduce((n, s) => n + s.bytes.byteLength, 0) +
        (text.map?.bytes.byteLength ?? 0);
    }
  }

  const ordered: ReportKind[] = ['image', 'font', 'css', 'js', 'html', 'svg', 'json', 'xml'];
  const out = ordered.map((k) => lines.get(k)).filter((l): l is KindLine => l !== undefined);

  return {
    files: rows.length,
    lines: out,
    bytesBefore: out.reduce((n, l) => n + l.before, 0),
    bytesServed: out.reduce((n, l) => n + l.served, 0),
    bytesCompressed: out.reduce((n, l) => n + (l.compressed || l.served), 0),
    bytesEmitted: out.reduce((n, l) => n + l.emitted, 0),
    skipped: out.reduce((n, l) => n + l.skipped, 0),
    warnings,
    metadataRemoved,
    locationsRemoved,
  };
}

/* ------------------------------------------------------------------ *
 * Snippets
 * ------------------------------------------------------------------ */

function imageSnippet(outcome: ImageOutcome, settings: ImageSettings): string | undefined {
  if (outcome.variants.length === 0) return undefined;
  if (settings.output === 'icons') return ICON_SNIPPET;
  const widths = [...new Set(outcome.variants.map((v) => v.width))].sort((a, b) => a - b);
  const imgWidth = defaultImgWidth(widths);
  const fallbacks = outcome.variants.filter((v) => v.format === 'fallback');
  const img = fallbacks.find((v) => v.width === imgWidth) ?? fallbacks[0] ?? outcome.variants[0]!;

  return pictureSnippet({
    sourcePath: outcome.inputPath,
    variants: outcome.variants.map(({ format, mime, width, path, bytes }) => ({
      format,
      mime,
      width,
      path,
      bytes: bytes.byteLength,
    })),
    naturalWidth: outcome.naturalWidth,
    naturalHeight: outcome.naturalHeight,
    imgSrc: img.path,
    sizes: settings.sizes,
    lazy: settings.lazy,
    alt: '',
    placeholder: outcome.placeholder,
  });
}

function fontSnippet(outcome: FontOutcome, settings: FontSettings): string | undefined {
  if (outcome.slices.length === 0) return undefined;
  return fontFaceSnippet({
    family: outcome.family,
    weight: outcome.weight,
    italic: outcome.italic,
    slices: outcome.slices.map((s) => ({
      woffPath: s.woff?.path,
      path: s.path,
      unicodeRange: s.unicodeRange,
      name: s.name,
    })),
    display: settings.display,
    preload: settings.preload,
  });
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

/**
 * Run every asset through the pool, dispatching on what it turned out to be.
 * Anything we have no pipeline for is inspected and copied through untouched.
 *
 * `onUpdate` fires on every progress tick so the UI can show what each worker is
 * doing rather than a spinner.
 */
export async function optimizeAssets(
  assets: Asset[],
  settings: Settings,
  onUpdate: (index: number, patch: Partial<Row>) => void,
): Promise<Row[]> {
  // Subsetting to "characters you actually use" needs to know what those are
  // before any font job starts, so this one barrier is unavoidable. It only runs
  // in that mode, and reading a few text files is cheap next to a codec.
  let used: number[] = [];
  if (settings.font.mode === 'used' && assets.some((a) => a.kind === 'font')) {
    const texts = assets.filter((a) => isTextKind(a.kind));
    const found = await runAll(texts, (asset, api) => api.scanCodepoints(asset.bytes));
    used = [...new Set(found.flat())];
  }

  // When there are fewer files than workers, an image becomes one job per
  // output format, so a single large photo keeps
  // up to three workers busy instead of one (AVIF at 2560px alone can take a
  // minute) - and a full batch, which already fills the pool, is left alone,
  // since splitting it would only repeat each decode and resize. Jobs
  // are split here, before the pool, never inside a pool task - a task that
  // waited on more pool slots could deadlock a full pool.
  const enabled = (['avif', 'webp', 'fallback'] as const).filter((f) => settings.image.formats[f]);
  type Job = {
    asset: Asset;
    index: number;
    format?: OutputFormat;
    first?: boolean;
    slice?: { index: number; count: number };
  };
  const images = assets.filter((a) => a.kind === 'image').length;
  const split = enabled.length > 1 && assets.length < poolSize;
  // Width slices per format: as many as idle workers allow, at most three
  // (a ladder has five or six widths).
  const slices = split ? Math.max(1, Math.min(3, Math.floor(poolSize / Math.max(1, images * enabled.length)))) : 1;
  // An animation is converted as a whole (ADR-038), and an icon set is made
  // from one picture (ADR-039), so neither is split.
  const splittable = (asset: Asset) =>
    asset.kind === 'image' &&
    split &&
    settings.image.output !== 'icons' &&
    !(asset.mime === 'image/gif' && isAnimatedGif(asset.bytes));
  // One icon set per run: its files have fixed names, and a second would overwrite the first.
  const iconSource = settings.image.output === 'icons' ? assets.find((a) => a.kind === 'image') : undefined;
  const jobs: Job[] = assets.flatMap((asset, index): Job[] =>
    splittable(asset)
      ? enabled.flatMap((format, f) =>
          Array.from({ length: slices }, (_, s) => ({
            asset,
            index,
            format,
            first: f === 0 && s === 0,
            slice: slices > 1 ? { index: s, count: slices } : undefined,
          })),
        )
      : [{ asset, index }],
  );

  const parts = new Map<number, { progress: number[]; outcomes: ImageOutcome[]; expected: number }>();
  for (const job of jobs) {
    if (job.format === undefined && job.slice === undefined) continue;
    const entry = parts.get(job.index) ?? { progress: [], outcomes: [], expected: 0 };
    entry.expected++;
    entry.progress.push(0);
    parts.set(job.index, entry);
  }

  const rows: Row[] = assets.map(newRow);

  const seen = new Map<number, number>();
  const slotOf = (index: number) => {
    const n = seen.get(index) ?? 0;
    seen.set(index, n + 1);
    return n;
  };

  await runAll(jobs, async ({ asset, index, format, first, slice }, api): Promise<void> => {
    const part = parts.get(index);
    const slot = part ? slotOf(index) : 0;
    if (!part || slot === 0) onUpdate(index, { state: 'running', progress: 0, label: 'Starting' });

    // Comlink cannot structured-clone a function; it has to be proxied.
    const report = Comlink.proxy((progress: number, label: string) => {
      if (!part) return onUpdate(index, { progress, label });
      part.progress[slot] = progress;
      onUpdate(index, {
        state: 'running',
        progress: part.progress.reduce((n, p) => n + p, 0) / part.expected,
        label,
      });
    });

    const done = (patch: Partial<Row>) => {
      const row: Row = { ...newRow(asset), state: 'done', progress: 1, label: '', ...patch };
      rows[index] = row;
      onUpdate(index, row);
    };

    if (asset.kind === 'image' && iconSource && asset !== iconSource) {
      return done({
        outcome: {
          inputPath: asset.path,
          bytesBefore: asset.bytes.byteLength,
          naturalWidth: 0,
          naturalHeight: 0,
          variants: [],
          metadataRemoved: 0,
          warnings: [],
          skipped: `One icon set is made at a time, and this run's comes from ${iconSource.path}. Drop this picture on its own to make icons from it.`,
        },
      });
    }

    if (asset.kind === 'image') {
      const single = format
        ? {
            ...settings.image,
            formats: { avif: format === 'avif', webp: format === 'webp', fallback: format === 'fallback' },
            // One placeholder per image, not one per format.
            thumbhash: settings.image.thumbhash && first === true,
            slice,
          }
        : settings.image;
      const outcome = await api.optimizeImage(asset.path, asset.mime, asset.bytes, single, report);
      if (!part) return done({ outcome, snippet: imageSnippet(outcome, settings.image) });

      part.outcomes.push(outcome);
      if (part.outcomes.length < part.expected) return;
      const merged = mergeOutcomes(part.outcomes);
      return done({ outcome: merged, snippet: imageSnippet(merged, settings.image) });
    }

    if (asset.kind === 'font') {
      const font = await api.optimizeFont(asset.path, asset.bytes, settings.font, used, report);
      return done({ font, snippet: fontSnippet(font, settings.font) });
    }

    if (isTextKind(asset.kind)) {
      const text = await api.optimizeText(
        asset.path,
        asset.kind,
        asset.bytes,
        settings.text,
        report,
      );
      return done({ text });
    }

    const inspection = await api.inspect(asset.bytes, asset.mime, asset.kind);
    return done({ inspection });
  }, (job) => needsFor(job.asset, settings, job.format));

  return rows;
}

const FORMAT_ORDER: OutputFormat[] = ['avif', 'webp', 'fallback'];

/**
 * One image's per-format results, put back together as if one worker had made
 * them all. Skipped only if every format was skipped; otherwise a format's own
 * failure is already a warning on its outcome.
 */
export function mergeOutcomes(outcomes: ImageOutcome[]): ImageOutcome {
  // An empty width slice contributed nothing, and says nothing either.
  const real = outcomes.filter((o) => !o.empty);
  outcomes = real.length > 0 ? real : outcomes;
  const made = outcomes.filter((o) => !o.skipped);
  const base = made[0] ?? outcomes[0]!;
  if (made.length === 0) {
    return { ...base, warnings: [...new Set(outcomes.flatMap((o) => o.warnings))] };
  }
  const variants = made
    .flatMap((o) => o.variants)
    .sort((x, y) => x.width - y.width || FORMAT_ORDER.indexOf(x.format) - FORMAT_ORDER.indexOf(y.format));
  return {
    ...base,
    variants,
    placeholder: outcomes.find((o) => o.placeholder)?.placeholder,
    metadataRemoved: Math.max(...outcomes.map((o) => o.metadataRemoved)),
    warnings: [...new Set(outcomes.flatMap((o) => o.warnings))],
    skipped: undefined,
  };
}
