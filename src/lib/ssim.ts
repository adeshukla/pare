/**
 * How alike two pictures are, as a number (ADR-049). A size saving says what an
 * encode gained; this says what it cost, measured instead of eyeballed.
 *
 * SSIM (Wang et al. 2004) on brightness only, over 8×8 windows stepped every 4
 * pixels, with the paper's constants. 1 means identical; photographs encoded at
 * sensible settings land around 0.95-0.99. Brightness only because that is
 * where the eye sees most detail and what most published SSIM figures use.
 * Transparent pixels are laid over white first, so a hidden colour change under
 * alpha 0 does not count and a visible one does.
 *
 * Plain arithmetic, no dependency: it runs in the worker on pixels already
 * decoded there.
 */
export type Pixels = { data: ArrayLike<number>; width: number; height: number };

const WINDOW = 8;
const STEP = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

function luma({ data, width, height }: Pixels): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    const a = data[i + 3]! / 255;
    const y = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    out[p] = y * a + 255 * (1 - a);
  }
  return out;
}

/** SSIM of `b` against `a`, 0-1 (it can dip just below 0 for inverted images). Same size required. */
export function ssim(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('ssim: sizes differ');
  const { width, height } = a;
  const x = luma(a);
  const y = luma(b);
  // An image smaller than one window is compared as a single window.
  const w = Math.min(WINDOW, width);
  const h = Math.min(WINDOW, height);
  const n = w * h;

  let total = 0;
  let windows = 0;
  for (let top = 0; top + h <= height; top += STEP) {
    for (let left = 0; left + w <= width; left += STEP) {
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let r = 0; r < h; r++) {
        let p = (top + r) * width + left;
        for (let c = 0; c < w; c++, p++) {
          const u = x[p]!;
          const v = y[p]!;
          sx += u;
          sy += v;
          sxx += u * u;
          syy += v * v;
          sxy += u * v;
        }
      }
      const mx = sx / n;
      const my = sy / n;
      const vx = sxx / n - mx * mx;
      const vy = syy / n - my * my;
      const cov = sxy / n - mx * my;
      total += ((2 * mx * my + C1) * (2 * cov + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2));
      windows++;
    }
  }
  return total / windows;
}

/**
 * The lowest quality whose output still scores at least `floor`, by binary
 * search over whole quality steps. Assumes the score rises with quality, which
 * holds for these encoders to within noise. If even `max` falls short, `max`
 * is returned with its score, and the caller says so.
 */
export async function lowestQuality(
  score: (quality: number) => Promise<number>,
  floor: number,
  { min = 10, max = 95 }: { min?: number; max?: number } = {},
): Promise<{ quality: number; score: number; tries: number }> {
  let tries = 1;
  let best = { quality: max, score: await score(max) };
  if (best.score < floor) return { ...best, tries };
  let lo = min;
  let hi = max - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const s = await score(mid);
    tries++;
    if (s >= floor) {
      best = { quality: mid, score: s };
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return { ...best, tries };
}

/** Three decimals, rounded down so a score is never shown higher than measured (Law 5). */
export const formatSsim = (s: number) => (Math.floor(s * 1000) / 1000).toFixed(3);
