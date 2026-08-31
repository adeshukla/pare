import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildZip, snippetsDocument } from '../../src/lib/emit';
import { servedVariant, summarise, type Row } from '../../src/lib/optimize';
import type { Asset, ImageOutcome, Variant } from '../../src/lib/types';

const asset = (path: string, size: number, kind: Asset['kind'] = 'image'): Asset => ({
  path,
  bytes: new Uint8Array(size).fill(7),
  kind,
  mime: kind === 'image' ? 'image/jpeg' : 'text/css',
  refs: [],
  resolvable: false,
});

const variant = (
  format: Variant['format'],
  width: number,
  size: number,
  path: string,
): Variant => ({
  format,
  mime: format === 'fallback' ? 'image/jpeg' : `image/${format}`,
  width,
  height: Math.round(width * 0.5),
  path,
  bytes: new Uint8Array(size).fill(1),
});

const outcome = (over: Partial<ImageOutcome> = {}): ImageOutcome => ({
  inputPath: 'hero.jpg',
  bytesBefore: 1000,
  naturalWidth: 800,
  naturalHeight: 400,
  variants: [
    variant('avif', 400, 40, 'hero-400.avif'),
    variant('avif', 800, 120, 'hero-800.avif'),
    variant('webp', 800, 200, 'hero-800.webp'),
    variant('fallback', 800, 400, 'hero-800.jpg'),
  ],
  metadataRemoved: 0,
  warnings: [],
  ...over,
});

const row = (over: Partial<Row> = {}): Row => ({
  asset: asset('hero.jpg', 1000),
  state: 'done',
  progress: 1,
  label: '',
  ...over,
});

describe('servedVariant', () => {
  it('picks the smallest file at full width - what a browser actually fetches', () => {
    expect(servedVariant(outcome())?.path).toBe('hero-800.avif');
  });

  it('ignores smaller rungs, which nobody downloads at full width', () => {
    expect(servedVariant(outcome())?.width).toBe(800);
  });

  it('has nothing to report when no full-width output survived', () => {
    expect(servedVariant(outcome({ variants: [] }))).toBeUndefined();
  });
});

describe('summarise', () => {
  it('measures the saving against the served file, not the sum of every output', () => {
    const report = summarise([row({ outcome: outcome() })]);
    expect(report.bytesBefore).toBe(1000);
    expect(report.bytesServed).toBe(120); // the AVIF a browser takes
    expect(report.bytesEmitted).toBe(760); // everything in the zip
  });

  it('counts a skipped file at its original size, since it is copied through', () => {
    const report = summarise([
      row({ outcome: outcome({ skipped: 'Could not read this file.', variants: [] }) }),
    ]);
    expect(report.skipped).toBe(1);
    expect(report.bytesServed).toBe(1000);
    expect(report.bytesEmitted).toBe(1000);
  });

  it('leaves non-image files out of the image totals', () => {
    const report = summarise([
      row({ outcome: outcome() }),
      row({ asset: asset('site.css', 5000, 'css'), inspection: { gzipBytes: 900, rawBytes: 5000 } }),
    ]);
    expect(report.files).toBe(2);
    expect(report.images).toBe(1);
    expect(report.bytesBefore).toBe(1000);
  });

  it('adds up warnings and stripped metadata across the run', () => {
    const report = summarise([
      row({ outcome: outcome({ warnings: ['a', 'b'], metadataRemoved: 128 }) }),
      row({ outcome: outcome({ warnings: ['c'], metadataRemoved: 64 }) }),
    ]);
    expect(report.warnings).toBe(3);
    expect(report.metadataRemoved).toBe(192);
  });
});

describe('buildZip', () => {
  it('writes every variant at its own path and keeps folder structure', () => {
    const zip = unzipSync(
      buildZip([
        row({
          asset: asset('img/hero.jpg', 1000),
          outcome: outcome({
            variants: [
              variant('avif', 800, 120, 'img/hero-800.avif'),
              variant('fallback', 800, 400, 'img/hero-800.jpg'),
            ],
          }),
          snippet: '<picture></picture>',
        }),
      ]),
    );

    expect(Object.keys(zip).sort()).toEqual([
      'img/hero-800.avif',
      'img/hero-800.jpg',
      'snippets.html',
    ]);
  });

  it('copies through anything the pipeline did not touch', () => {
    const zip = unzipSync(
      buildZip([
        row({ asset: asset('site.css', 20, 'css'), inspection: { gzipBytes: 8, rawBytes: 20 } }),
        row({ asset: asset('broken.jpg', 30), outcome: outcome({ variants: [], skipped: 'no' }) }),
      ]),
    );
    expect(Object.keys(zip).sort()).toEqual(['broken.jpg', 'site.css']);
    expect(zip['site.css']!.byteLength).toBe(20);
  });

  it('omits snippets.html when nothing generated markup', () => {
    const zip = unzipSync(buildZip([row({ asset: asset('a.css', 10, 'css') })]));
    expect(zip['snippets.html']).toBeUndefined();
  });
});

describe('snippetsDocument', () => {
  it('lists the markup, then what was left alone and why', () => {
    const text = snippetsDocument([
      row({ snippet: '<picture>A</picture>', outcome: outcome({ warnings: ['a note'] }) }),
      row({
        asset: asset('bad.jpg', 10),
        outcome: outcome({ variants: [], skipped: 'It was copied unchanged.' }),
      }),
    ]);

    expect(text).toContain('<picture>A</picture>');
    expect(text).toContain('Files left unchanged:');
    expect(text).toContain('It was copied unchanged.');
    expect(text).toContain('a note');
  });

  it('round-trips as UTF-8 through the zip', () => {
    const zip = unzipSync(buildZip([row({ snippet: '<picture>—</picture>' })]));
    expect(strFromU8(zip['snippets.html']!)).toContain('<picture>—</picture>');
  });
});
