/**
 * User-facing knobs for the image pipeline. Every one of these is a toggle in the
 * UI — AGENTS.md Law 4: every destructive step is switchable and reversible.
 */

export type OutputFormat = 'avif' | 'webp' | 'fallback';

export type ImageSettings = {
  /** Resize ladder, in CSS pixels. Editable. Widths above the source are dropped. */
  widths: number[];
  /** Which encoders run. `fallback` is the safe original-format output. */
  formats: Record<OutputFormat, boolean>;
  /** 1–100. Higher is bigger and better. Per format, because the scales differ. */
  quality: Record<OutputFormat, number>;
  /** Remove EXIF / XMP / comments. ICC colour profiles are always preserved. */
  stripMetadata: boolean;
  /** Emit a ThumbHash placeholder per image. */
  thumbhash: boolean;
  /** Goes straight into the `sizes` attribute of the generated snippet. */
  sizes: string;
  /** Emit `loading="lazy" decoding="async"` on the `<img>`. */
  lazy: boolean;
};

export const DEFAULT_WIDTHS = [400, 800, 1200, 1600, 2400];

export const DEFAULTS: ImageSettings = {
  widths: DEFAULT_WIDTHS,
  formats: { avif: true, webp: true, fallback: true },
  // AVIF's quality scale is not WebP's and neither is JPEG's. These are the
  // visually-comparable points, not the same number three times.
  quality: { avif: 50, webp: 75, fallback: 75 },
  stripMetadata: true,
  thumbhash: true,
  sizes: '(max-width: 768px) 100vw, 50vw',
  lazy: true,
};

export const FORMAT_LABEL: Record<OutputFormat, string> = {
  avif: 'AVIF',
  webp: 'WebP',
  fallback: 'Original format',
};

/* ------------------------------------------------------------------ *
 * Phase 2 - fonts
 * ------------------------------------------------------------------ */

/**
 * `split` is the default because it deletes nothing: every glyph the font had
 * still exists, spread across files the browser fetches only when a page needs
 * that script.
 *
 * `used` genuinely removes glyphs, and a static scan cannot see text that comes
 * from a database or from JavaScript. It is the same failure mode that keeps CSS
 * purging out of scope, so it is opt-in and it warns. See ADR-011.
 */
export type SubsetMode = 'split' | 'used' | 'keep';

export type FontSettings = {
  mode: SubsetMode;
  /** Extra characters to guarantee, on top of anything found by scanning. */
  extraText: string;
  /** `font-display` in the generated @font-face. */
  display: 'swap' | 'optional' | 'fallback' | 'block' | 'auto';
  preload: boolean;
};

export const FONT_DEFAULTS: FontSettings = {
  mode: 'split',
  extraText: '',
  display: 'swap',
  preload: true,
};

/* ------------------------------------------------------------------ *
 * Phase 3 - text
 * ------------------------------------------------------------------ */

export type TextSettings = {
  css: boolean;
  js: boolean;
  html: boolean;
  svg: boolean;
  /** Emit .gz siblings, built with the native CompressionStream. */
  gzip: boolean;
  /** Emit .br siblings. Costs a WASM download on first use. */
  brotli: boolean;
  /** Minimum browser versions handed to Lightning CSS. */
  target: TargetPreset;
  /**
   * A second JavaScript pass with Terser. Slower, usually a few percent smaller.
   *
   * JavaScript only. CSSO was tried for the CSS half and rejected for silently
   * deleting at-rules it is too old to parse - see ADR-020.
   */
  deeper: boolean;
};

/**
 * Explicit version floors rather than a browserslist query.
 *
 * `browserslist` resolves queries by reading config files and the caniuse
 * database off disk, which is not something that happens in a browser tab.
 * Naming the floors directly is honest about what is being targeted and costs
 * no dependency. See ADR-013.
 */
export type TargetPreset = 'modern' | 'wide';

export const TARGETS: Record<TargetPreset, { label: string; browsers: Record<string, number> }> = {
  modern: {
    label: 'Modern browsers',
    browsers: { chrome: 111, firefox: 113, safari: 16.4, edge: 111 },
  },
  wide: {
    label: 'Older browsers too',
    browsers: { chrome: 90, firefox: 88, safari: 14, edge: 90 },
  },
};

export const TEXT_DEFAULTS: TextSettings = {
  css: true,
  js: true,
  html: true,
  svg: true,
  gzip: true,
  brotli: false,
  target: 'modern',
  deeper: false,
};
