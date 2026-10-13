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
  /** PHP and other server templates: read for references, never rewritten. */
  | 'template'
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
  /** A width slice that had no widths to encode: contributes nothing when merged. */
  empty?: boolean;
};

/* ------------------------------------------------------------------ *
 * Phase 2 - fonts
 * ------------------------------------------------------------------ */

/** One emitted font file and the slice of Unicode it serves. */
export type FontSlice = {
  /** Range name, or 'subset' / 'whole font' for the single-file modes. */
  name: string;
  path: string;
  bytes: Uint8Array;
  codepoints: number;
  /** Ready for the `unicode-range` descriptor. Empty means "no restriction". */
  unicodeRange: string;
  /** The same slice as WOFF 1.0, for older browsers, when asked for. */
  woff?: { path: string; bytes: Uint8Array };
};

export type FontOutcome = {
  inputPath: string;
  bytesBefore: number;
  family: string;
  weight: number;
  italic: boolean;
  container: string;
  /** How many codepoints the source font could draw. */
  codepointsBefore: number;
  /** How many survive across every emitted slice. */
  codepointsAfter: number;
  slices: FontSlice[];
  /** The file a Latin-script page actually downloads. */
  bytesServed: number;
  warnings: string[];
  skipped?: string;
};

/* ------------------------------------------------------------------ *
 * Phase 3 - text
 * ------------------------------------------------------------------ */

export type TextKind = 'css' | 'js' | 'html' | 'svg';

export type TextOutcome = {
  inputPath: string;
  kind: TextKind;
  bytesBefore: number;
  /** After minification, before any transport compression. */
  bytesAfter: number;
  minified: Uint8Array;
  /** A source map holding the original text, when enabled. Never served to visitors. */
  map?: { path: string; bytes: Uint8Array };
  /** Sibling files: gzip and brotli, when enabled. */
  siblings: Array<{ path: string; bytes: Uint8Array; encoding: 'gzip' | 'brotli' }>;
  /** Smallest transport encoding available, which is what a server would send. */
  bytesTransport: number;
  warnings: string[];
  skipped?: string;
};
