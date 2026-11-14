import { describe, expect, it } from 'vitest';
import { formatSsim, lowestQuality, ssim } from '../../src/lib/ssim';

/** A 64×48 RGBA gradient with some texture, so windows have real variance. */
function picture(noise = 0, seed = 1, alpha = 255) {
  const width = 64;
  const height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = (x * 4 + y * 2 + ((x ^ y) & 8) * 6) + rand() * noise;
      data[i] = v;
      data[i + 1] = v * 0.8;
      data[i + 2] = 255 - v;
      data[i + 3] = alpha;
    }
  }
  return { data, width, height };
}

describe('ssim', () => {
  it('is exactly 1 for identical pictures', () => {
    expect(ssim(picture(), picture())).toBe(1);
  });

  it('falls as the difference grows', () => {
    const ref = picture();
    const light = ssim(ref, picture(6, 7));
    const heavy = ssim(ref, picture(40, 7));
    expect(light).toBeLessThan(1);
    expect(heavy).toBeLessThan(light);
    expect(heavy).toBeGreaterThan(0);
  });

  it('ignores colour hidden under full transparency', () => {
    expect(ssim(picture(0, 1, 0), picture(50, 3, 0))).toBe(1);
  });

  it('refuses pictures of different sizes', () => {
    const small = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
    expect(() => ssim(picture(), small)).toThrow();
  });

  it('handles a picture smaller than one window', () => {
    const tiny = { data: new Uint8ClampedArray(3 * 2 * 4).fill(200), width: 3, height: 2 };
    expect(ssim(tiny, tiny)).toBe(1);
  });
});

describe('lowestQuality', () => {
  // A fake encoder whose score rises smoothly with quality.
  const curve = (q: number) => 1 - 0.5 / (q + 5);

  it('finds the lowest quality that meets the floor', async () => {
    const r = await lowestQuality(async (q) => curve(q), 0.99);
    expect(curve(r.quality)).toBeGreaterThanOrEqual(0.99);
    expect(curve(r.quality - 1)).toBeLessThan(0.99);
    expect(r.score).toBe(curve(r.quality));
    expect(r.tries).toBeLessThanOrEqual(8);
  });

  it('returns the top quality and its score when the floor is out of reach', async () => {
    const r = await lowestQuality(async (q) => curve(q), 0.9999, { max: 90 });
    expect(r).toMatchObject({ quality: 90, tries: 1 });
    expect(r.score).toBeLessThan(0.9999);
  });

  it('can go all the way down to the minimum', async () => {
    const r = await lowestQuality(async () => 1, 0.95, { min: 10 });
    expect(r.quality).toBe(10);
  });
});

describe('formatSsim', () => {
  it('rounds down, never up', () => {
    expect(formatSsim(0.98999)).toBe('0.989');
    expect(formatSsim(1)).toBe('1.000');
  });
});
