/**
 * Turning a resize ladder plus a source width into the widths we will actually
 * emit.
 *
 * Two rules, both load-bearing:
 *   - Never upscale. Inventing pixels makes a bigger file that looks worse.
 *   - Always emit the source width, so there is a full-resolution output even
 *     when the ladder tops out below it.
 */

const MIN_WIDTH = 16;

export function resolveWidths(ladder: number[], sourceWidth: number): number[] {
  if (!Number.isFinite(sourceWidth) || sourceWidth < MIN_WIDTH) return [];

  const wanted = ladder
    .filter((w) => Number.isFinite(w) && w >= MIN_WIDTH && w < sourceWidth)
    .concat(sourceWidth);

  return [...new Set(wanted)].sort((a, b) => a - b);
}

/** Height that preserves the source aspect ratio. At least 1px. */
export function scaledHeight(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
): number {
  if (sourceWidth <= 0) return 0;
  return Math.max(1, Math.round((sourceHeight * targetWidth) / sourceWidth));
}

/**
 * The width the `<img>` fallback should point at: the largest rung that is not
 * the full-resolution original, so the default download stays modest. Falls back
 * to the only width there is when the ladder produced a single entry.
 */
export function defaultImgWidth(widths: number[]): number {
  if (widths.length === 0) return 0;
  if (widths.length === 1) return widths[0]!;
  return widths[widths.length - 2]!;
}
