import { describe, expect, it } from 'vitest';
import { mergeOutcomes } from '../../src/lib/optimize';
import { pictureSnippet, type SnippetInput } from '../../src/lib/snippet';
import type { ImageOutcome } from '../../src/lib/types';
import { splitSelectors, structuralSelector } from '../../src/lib/verify';

/**
 * One-size output and its markup, merging per-format jobs back together, and
 * the selector handling behind the unused-CSS report (ADR-031).
 */

const variant = (format: 'avif' | 'webp' | 'fallback', width: number) => ({
  format,
  mime: format === 'fallback' ? 'image/jpeg' : `image/${format}`,
  width,
  path: `photo-${width}.${format === 'fallback' ? 'jpg' : format}`,
  bytes: 100,
});

const input = (variants: SnippetInput['variants']): SnippetInput => ({
  sourcePath: 'photo.jpg',
  variants,
  naturalWidth: 300,
  naturalHeight: 300,
  imgSrc: variants.find((v) => v.format === 'fallback')?.path ?? variants[0]!.path,
  sizes: '100vw',
  lazy: false,
  alt: '',
});

describe('snippet for one size', () => {
  it('uses plain addresses when there is only one width', () => {
    const html = pictureSnippet(input([variant('avif', 300), variant('webp', 300), variant('fallback', 300)]));
    expect(html).toContain('<source type="image/avif" srcset="photo-300.avif">');
    expect(html).not.toContain('300w');
    expect(html).not.toContain('sizes=');
    expect(html).toContain('width="300" height="300"');
  });

  it('is a plain <img> when there is only one format', () => {
    const html = pictureSnippet(input([variant('webp', 400), variant('webp', 800)]));
    expect(html).not.toContain('<picture>');
    expect(html).toMatch(/<img src="photo-400\.webp" srcset="photo-400\.webp 400w, photo-800\.webp 800w" sizes="100vw"/);
  });

  it('still offers every format through <picture> for a responsive set', () => {
    const html = pictureSnippet(input([variant('avif', 400), variant('avif', 800), variant('fallback', 400), variant('fallback', 800)]));
    expect(html).toContain('<picture>');
    expect(html).toContain('photo-400.avif 400w, photo-800.avif 800w');
  });
});

describe('mergeOutcomes', () => {
  const outcome = (over: Partial<ImageOutcome>): ImageOutcome => ({
    inputPath: 'photo.jpg',
    bytesBefore: 1000,
    naturalWidth: 800,
    naturalHeight: 600,
    variants: [],
    metadataRemoved: 0,
    warnings: [],
    ...over,
  });
  const v = (format: 'avif' | 'webp' | 'fallback', width: number) => ({
    ...variant(format, width),
    height: 1,
    bytes: new Uint8Array(1),
  });

  it('puts per-format, per-width jobs back in width then format order', () => {
    const merged = mergeOutcomes([
      outcome({ variants: [v('fallback', 800)], warnings: ['same'] }),
      outcome({ variants: [v('avif', 400), v('avif', 800)], placeholder: 'data:x', warnings: ['same'] }),
      outcome({ empty: true }),
    ]);
    expect(merged.variants.map((x) => `${x.format}@${x.width}`)).toEqual(['avif@400', 'avif@800', 'fallback@800']);
    expect(merged.placeholder).toBe('data:x');
    expect(merged.warnings).toEqual(['same']);
    expect(merged.skipped).toBeUndefined();
  });

  it('is skipped only when every job was', () => {
    const merged = mergeOutcomes([outcome({ skipped: 'animated GIF' }), outcome({ skipped: 'animated GIF' })]);
    expect(merged.skipped).toBe('animated GIF');
  });
});

describe('selectors for the unused-CSS report', () => {
  it('splits a list only on top-level commas', () => {
    expect(splitSelectors('a, .b:is(.c, .d), [data-x="1,2"] > p')).toEqual([
      'a',
      '.b:is(.c, .d)',
      '[data-x="1,2"] > p',
    ]);
  });

  it('strips states and parts, keeping what can be found in a page', () => {
    expect(structuralSelector('.menu a:hover')).toBe('.menu a');
    expect(structuralSelector('.btn::before')).toBe('.btn');
    expect(structuralSelector('li:nth-child(2n+1) > a:focus-visible')).toBe('li > a');
    expect(structuralSelector(':root')).toBe('');
  });
});
