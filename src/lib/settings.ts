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
