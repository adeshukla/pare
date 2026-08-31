import * as Comlink from 'comlink';
import { runAll } from './pool';
import { defaultImgWidth } from './ladder';
import { pictureSnippet } from './snippet';
import type { ImageSettings } from './settings';
import type { Asset, ImageOutcome, Variant } from './types';
import type { Inspection } from '../workers/pipeline.worker';

/** One input file and everything we learned about it. */
export type Row = {
  asset: Asset;
  state: 'queued' | 'running' | 'done';
  /** 0-1. Updated from inside the worker so nothing runs silently. */
  progress: number;
  label: string;
  outcome?: ImageOutcome;
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

export type Report = {
  files: number;
  images: number;
  /** Sum of the original image files. */
  bytesBefore: number;
  /** Sum of what a browser fetches at full width, best format. */
  bytesServed: number;
  /** Every file we emit, across all widths and formats. This is the zip size. */
  bytesEmitted: number;
  skipped: number;
  warnings: number;
  metadataRemoved: number;
};

export function summarise(rows: Row[]): Report {
  const report: Report = {
    files: rows.length,
    images: 0,
    bytesBefore: 0,
    bytesServed: 0,
    bytesEmitted: 0,
    skipped: 0,
    warnings: 0,
    metadataRemoved: 0,
  };

  for (const row of rows) {
    const outcome = row.outcome;
    if (!outcome) continue;
    report.images++;
    report.bytesBefore += outcome.bytesBefore;
    report.warnings += outcome.warnings.length;
    report.metadataRemoved += outcome.metadataRemoved;
    if (outcome.skipped) {
      report.skipped++;
      // A skipped file is copied through unchanged, so it costs what it cost.
      report.bytesServed += outcome.bytesBefore;
      report.bytesEmitted += outcome.bytesBefore;
      continue;
    }
    report.bytesServed += servedVariant(outcome)?.bytes.byteLength ?? outcome.bytesBefore;
    for (const v of outcome.variants) report.bytesEmitted += v.bytes.byteLength;
  }

  return report;
}

function buildSnippet(outcome: ImageOutcome, settings: ImageSettings): string | undefined {
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

/**
 * Run every asset through the pool. Images get the full pipeline; everything else
 * is inspected and passed through untouched, because Phase 1 is images only.
 *
 * `onUpdate` fires on every progress tick, so the UI can show what each worker is
 * doing rather than a spinner.
 */
export async function optimizeAssets(
  assets: Asset[],
  settings: ImageSettings,
  onUpdate: (index: number, patch: Partial<Row>) => void,
): Promise<Row[]> {
  const indexed = assets.map((asset, index) => ({ asset, index }));

  return runAll(indexed, async ({ asset, index }, api): Promise<Row> => {
    onUpdate(index, { state: 'running', progress: 0, label: 'Starting' });

    if (asset.kind !== 'image') {
      const inspection = await api.inspect(asset.bytes, asset.mime, asset.kind);
      const row: Row = { ...newRow(asset), state: 'done', progress: 1, label: '', inspection };
      onUpdate(index, row);
      return row;
    }

    const outcome = await api.optimizeImage(
      asset.path,
      asset.mime,
      asset.bytes,
      settings,
      // Comlink cannot structured-clone a function; it has to be proxied.
      Comlink.proxy((progress: number, label: string) => onUpdate(index, { progress, label })),
    );

    const row: Row = {
      ...newRow(asset),
      state: 'done',
      progress: 1,
      label: '',
      outcome,
      snippet: buildSnippet(outcome, settings),
    };
    onUpdate(index, row);
    return row;
  });
}
