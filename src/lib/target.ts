/**
 * Fitting an image under a file-size limit. ADR-034.
 *
 * "Make it under 100 KB" is the most common thing people want from an image
 * tool - for a job or exam portal, an email, a chat. Two dials reach a size:
 * quality, and dimensions. Quality goes first, because a slightly softer image
 * at full size is almost always what the person wanted; dimensions shrink only
 * when even a low quality will not fit, and the result says so.
 *
 * Pure: the caller supplies `encode`, so this is tested in Node with a fake.
 */

export type Fitted<T> = {
  result: T;
  /** The quality the result was made at (the lossless setting for PNG). */
  quality: number;
  /** 1 = full size; below 1, the image was scaled down to fit. */
  scale: number;
  /** False when nothing reachable fitted; `result` is then the smallest made. */
  fits: boolean;
  /** How many encodes it took, for progress and tests. */
  tries: number;
};

export type FitOptions = {
  /** Highest quality to try - the user's slider. */
  maxQuality: number;
  /** Lowest quality worth shipping before shrinking the image instead. */
  minQuality?: number;
  /** PNG has no quality dial; only scaling helps. */
  lossless?: boolean;
  /** Smallest width worth producing, in pixels. */
  minWidth?: number;
  /** Width at scale 1, so `minWidth` can be enforced. */
  width: number;
};

export async function fitToSize<T extends { bytes: number }>(
  encode: (quality: number, scale: number) => Promise<T>,
  limit: number,
  options: FitOptions,
): Promise<Fitted<T>> {
  const minQuality = options.minQuality ?? 30;
  const minWidth = options.minWidth ?? 64;
  let tries = 0;
  const run = async (quality: number, scale: number) => {
    tries++;
    return encode(quality, scale);
  };

  let scale = 1;
  let smallest: Fitted<T> | undefined;

  for (let step = 0; step < 8; step++) {
    // 1. The best the user asked for.
    const top = await run(options.maxQuality, scale);
    if (top.bytes <= limit) return { result: top, quality: options.maxQuality, scale, fits: true, tries };

    let floor: T = top;
    let floorQuality = options.maxQuality;

    if (!options.lossless && minQuality < options.maxQuality) {
      // 2. The lowest quality worth shipping. If that fits, the answer lies
      //    between the two: search for the highest quality that still fits.
      const low = await run(minQuality, scale);
      floor = low;
      floorQuality = minQuality;
      if (low.bytes <= limit) {
        let lo = minQuality;
        let best = low;
        let hi = options.maxQuality;
        while (hi - lo > 2) {
          const mid = Math.round((lo + hi) / 2);
          const attempt = await run(mid, scale);
          if (attempt.bytes <= limit) {
            lo = mid;
            best = attempt;
          } else {
            hi = mid;
          }
        }
        return { result: best, quality: lo, scale, fits: true, tries };
      }
    }

    if (!smallest || floor.bytes < smallest.result.bytes) {
      smallest = { result: floor, quality: floorQuality, scale, fits: false, tries };
    }

    // 3. Too big even so: scale down. Bytes grow roughly with pixel count, so
    //    shrink each side by the square root of the overshoot, plus a margin.
    const next = scale * Math.sqrt(limit / floor.bytes) * 0.92;
    if (options.width * next < minWidth) break;
    scale = next;
  }

  return { ...smallest!, tries };
}
