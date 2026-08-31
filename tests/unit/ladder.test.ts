import { describe, expect, it } from 'vitest';
import { defaultImgWidth, resolveWidths, scaledHeight } from '../../src/lib/ladder';
import { DEFAULT_WIDTHS } from '../../src/lib/settings';

describe('resolveWidths', () => {
  it('never upscales', () => {
    // 900px wide source: 1200/1600/2400 would all be invented pixels.
    expect(resolveWidths(DEFAULT_WIDTHS, 900)).toEqual([400, 800, 900]);
  });

  it('always includes the source width so there is a full-resolution output', () => {
    expect(resolveWidths([400], 3000)).toEqual([400, 3000]);
    expect(resolveWidths([], 1500)).toEqual([1500]);
  });

  it('does not emit the source width twice when the ladder already names it', () => {
    expect(resolveWidths([400, 800], 800)).toEqual([400, 800]);
  });

  it('sorts and de-duplicates whatever the user typed', () => {
    expect(resolveWidths([800, 400, 800, 1200], 2000)).toEqual([400, 800, 1200, 2000]);
  });

  it('declines images too small to be worth a ladder', () => {
    expect(resolveWidths(DEFAULT_WIDTHS, 8)).toEqual([]);
    expect(resolveWidths(DEFAULT_WIDTHS, Number.NaN)).toEqual([]);
  });

  it('ignores junk rungs rather than emitting a zero-width file', () => {
    expect(resolveWidths([0, -100, Number.NaN, 400], 1000)).toEqual([400, 1000]);
  });
});

describe('scaledHeight', () => {
  it('preserves the aspect ratio', () => {
    expect(scaledHeight(1600, 900, 800)).toBe(450);
    expect(scaledHeight(1200, 800, 400)).toBe(267);
  });

  it('never rounds a dimension down to zero', () => {
    expect(scaledHeight(4000, 3, 16)).toBe(1);
  });
});

describe('defaultImgWidth', () => {
  it('points the <img> fallback below full resolution', () => {
    expect(defaultImgWidth([400, 800, 1200, 2400])).toBe(1200);
  });

  it('uses the only width available when there is just one', () => {
    expect(defaultImgWidth([640])).toBe(640);
    expect(defaultImgWidth([])).toBe(0);
  });
});
