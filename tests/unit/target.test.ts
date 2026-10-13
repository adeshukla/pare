import { describe, expect, it } from 'vitest';
import { fitToSize } from '../../src/lib/target';

/** A fake encoder: bytes grow with quality and with pixel count. */
const fake = (bytesAtFull: (q: number) => number) => async (quality: number, scale: number) => ({
  bytes: Math.round(bytesAtFull(quality) * scale * scale),
});

describe('fitToSize', () => {
  it('keeps the requested quality when it already fits', async () => {
    const r = await fitToSize(fake((q) => q * 1000), 100_000, { maxQuality: 75, width: 1200 });
    expect(r).toMatchObject({ quality: 75, scale: 1, fits: true, tries: 1 });
  });

  it('finds the highest quality under the limit before touching the size', async () => {
    const r = await fitToSize(fake((q) => q * 2000), 100_000, { maxQuality: 85, width: 1200 });
    expect(r.fits).toBe(true);
    expect(r.scale).toBe(1);
    expect(r.result.bytes).toBeLessThanOrEqual(100_000);
    // 50 * 2000 = 100 KB exactly; within the search's 2-step resolution.
    expect(r.quality).toBeGreaterThanOrEqual(48);
    expect(r.quality).toBeLessThanOrEqual(50);
  });

  it('scales down only when even the lowest quality is too big', async () => {
    const r = await fitToSize(fake((q) => 400_000 + q * 1000), 100_000, { maxQuality: 80, width: 1200 });
    expect(r.fits).toBe(true);
    expect(r.scale).toBeLessThan(1);
    expect(r.result.bytes).toBeLessThanOrEqual(100_000);
  });

  it('for lossless output, scales without searching quality', async () => {
    const r = await fitToSize(fake(() => 900_000), 100_000, { maxQuality: 100, lossless: true, width: 2000 });
    expect(r.fits).toBe(true);
    expect(r.quality).toBe(100);
    expect(r.scale).toBeLessThan(0.34);
  });

  it('says so when nothing reachable fits, and returns the smallest it made', async () => {
    const r = await fitToSize(fake(() => 10_000_000), 1_000, { maxQuality: 80, width: 200, minWidth: 64 });
    expect(r.fits).toBe(false);
    expect(r.result.bytes).toBeGreaterThan(1_000);
  });
});
