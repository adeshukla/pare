/**
 * Core types. See docs/ARCHITECTURE.md.
 *
 * Law 5 lives here: `Result` has no error channel. A failed optimizer returns the
 * input unchanged with a plain-language `skipped` reason. One bad file must never
 * fail a run.
 */

import type { OutputFormat } from './settings';

export type AssetKind =
  | 'image'
  | 'font'
  | 'css'
  | 'js'
  | 'html'
  | 'svg'
  | 'other';

export type Reference = {
  /** Path of the file doing the referencing. */
  from: string;
  /** Raw reference text as it appears in the source. */
  raw: string;
  /**
   * False when the reference is built dynamically (JS string concat, inline
   * onclick, server template). Law 3: an asset with any unresolvable reference
   * is never hashed or renamed.
   */
  resolvable: boolean;
};

export type Asset = {
  path: string;
  bytes: Uint8Array;
  kind: AssetKind;
  /** Detected from magic bytes where possible, extension as fallback. */
  mime: string;
  refs: Reference[];
  /** Derived: false if any reference is unresolvable. */
  resolvable: boolean;
};

export type Warning = {
  path: string;
  /** Written for a non-technical reader. Not an errno. */
  message: string;
};

export type Job = {
  asset: Asset;
  optimizer: string;
  options: Record<string, unknown>;
};

export type Result = {
  optimizer: string;
  inputPath: string;
  /** May be several — e.g. avif + webp + optimized fallback. */
  outputs: Asset[];
  /** Paste-ready markup, when this optimizer changes how the asset is referenced. */
  snippet?: string;
  bytesBefore: number;
  bytesAfter: number;
  warnings: Warning[];
  /** Present when nothing was done. Explains why, in plain language. */
  skipped?: string;
};

export type Progress = {
  jobId: string;
  /** 0–1. Report at least every 500ms — no silent operations. */
  ratio: number;
  label: string;
};

/** Every optimizer implements this. Never throws. */
export interface Optimizer {
  readonly name: string;
  accepts(asset: Asset): boolean;
  run(job: Job, onProgress: (p: number, label: string) => void): Promise<Result>;
}

export function passthrough(asset: Asset, optimizer: string, reason: string): Result {
  return {
    optimizer,
    inputPath: asset.path,
    outputs: [asset],
    bytesBefore: asset.bytes.byteLength,
    bytesAfter: asset.bytes.byteLength,
    warnings: [],
    skipped: reason,
  };
}

/* ------------------------------------------------------------------ *
 * Phase 1 - image pipeline
 * ------------------------------------------------------------------ */

/** One encoded file: a single width in a single format. */
export type Variant = {
  format: OutputFormat;
  mime: string;
  width: number;
  height: number;
  path: string;
  bytes: Uint8Array;
};

/**
 * What the worker hands back for one image. There is no error branch, per the
 * `Result` contract above: a run that produced nothing comes back with `variants`
 * empty and a `skipped` reason a non-technical reader can act on.
 */
export type ImageOutcome = {
  inputPath: string;
  bytesBefore: number;
  naturalWidth: number;
  naturalHeight: number;
  variants: Variant[];
  /** ThumbHash data URI, when enabled and the image decoded. */
  placeholder?: string;
  /** Bytes saved on the passthrough copy by dropping EXIF and friends. */
  metadataRemoved: number;
  warnings: string[];
  skipped?: string;
};
