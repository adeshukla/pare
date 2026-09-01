import * as Comlink from 'comlink';
import { runAll } from './pool';
import { defaultImgWidth } from './ladder';
import { fontFaceSnippet } from './font-snippet';
import { pictureSnippet } from './snippet';
import type { FontSettings, ImageSettings, TextSettings } from './settings';
import type { Asset, FontOutcome, ImageOutcome, TextKind, TextOutcome, Variant } from './types';
import type { Inspection } from '../workers/pipeline.worker';

export type Settings = {
  image: ImageSettings;
  font: FontSettings;
  text: TextSettings;
};

/** Asset kinds the text pipeline handles, and that the font scanner reads. */
const TEXT_KINDS = new Set<Asset['kind']>(['css', 'js', 'html', 'svg']);
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

export type ReportKind = 'image' | 'font' | 'css' | 'js' | 'html' | 'svg';

export const REPORT_LABEL: Record<ReportKind, string> = {
  image: 'Images',
  font: 'Fonts',
  css: 'CSS',
  js: 'JavaScript',
  html: 'HTML',
  svg: 'SVG',
};

export type KindLine = {
  kind: ReportKind;
  count: number;
  before: number;
  /** What a visitor downloads. */
  served: number;
  /** Every file emitted for this kind. */
  emitted: number;
  skipped: number;
};

export type Report = {
  files: number;
  lines: KindLine[];
  bytesBefore: number;
  bytesServed: number;
  bytesEmitted: number;
  skipped: number;
  warnings: number;
  metadataRemoved: number;
};

function blank(kind: ReportKind): KindLine {
  return { kind, count: 0, before: 0, served: 0, emitted: 0, skipped: 0 };
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

  for (const row of rows) {
    if (row.outcome) {
      const outcome = row.outcome;
      const l = line('image');
      l.count++;
      l.before += outcome.bytesBefore;
      warnings += outcome.warnings.length;
      metadataRemoved += outcome.metadataRemoved;

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
        for (const s of font.slices) l.emitted += s.bytes.byteLength;
      }
    }

    if (row.text) {
      const text = row.text;
      const l = line(text.kind);
      l.count++;
      l.before += text.bytesBefore;
      warnings += text.warnings.length;
      if (text.skipped) l.skipped++;
      // A server sends the smallest encoding it has; that is what a visitor pays.
      l.served += text.bytesTransport;
      l.emitted += text.bytesAfter + text.siblings.reduce((n, s) => n + s.bytes.byteLength, 0);
    }
  }

  const ordered: ReportKind[] = ['image', 'font', 'css', 'js', 'html', 'svg'];
  const out = ordered.map((k) => lines.get(k)).filter((l): l is KindLine => l !== undefined);

  return {
    files: rows.length,
    lines: out,
    bytesBefore: out.reduce((n, l) => n + l.before, 0),
    bytesServed: out.reduce((n, l) => n + l.served, 0),
    bytesEmitted: out.reduce((n, l) => n + l.emitted, 0),
    skipped: out.reduce((n, l) => n + l.skipped, 0),
    warnings,
    metadataRemoved,
  };
}

/* ------------------------------------------------------------------ *
 * Snippets
 * ------------------------------------------------------------------ */

function imageSnippet(outcome: ImageOutcome, settings: ImageSettings): string | undefined {
  if (outcome.variants.length === 0) return undefined;
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

  const indexed = assets.map((asset, index) => ({ asset, index }));

  return runAll(indexed, async ({ asset, index }, api): Promise<Row> => {
    onUpdate(index, { state: 'running', progress: 0, label: 'Starting' });

    // Comlink cannot structured-clone a function; it has to be proxied.
    const report = Comlink.proxy((progress: number, label: string) =>
      onUpdate(index, { progress, label }),
    );

    const done = (patch: Partial<Row>): Row => {
      const row: Row = { ...newRow(asset), state: 'done', progress: 1, label: '', ...patch };
      onUpdate(index, row);
      return row;
    };

    if (asset.kind === 'image') {
      const outcome = await api.optimizeImage(
        asset.path,
        asset.mime,
        asset.bytes,
        settings.image,
        report,
      );
      return done({ outcome, snippet: imageSnippet(outcome, settings.image) });
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
  });
}
