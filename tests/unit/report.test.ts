import { unzipSync, strFromU8 } from 'fflate';
const unzipBlob = async (blob: Blob) => unzipSync(new Uint8Array(await blob.arrayBuffer()));
import { describe, expect, it } from 'vitest';
import { buildZip, snippetsDocument } from '../../src/lib/emit';
import { servedVariant, summarise, type Row } from '../../src/lib/optimize';
import type {
  Asset,
  FontOutcome,
  ImageOutcome,
  TextOutcome,
  Variant,
} from '../../src/lib/types';

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

const font = (over: Partial<FontOutcome> = {}): FontOutcome => ({
  inputPath: 'fonts/plex.woff2',
  bytesBefore: 15000,
  family: 'IBM Plex Mono',
  weight: 400,
  italic: false,
  container: 'woff2',
  codepointsBefore: 400,
  codepointsAfter: 400,
  slices: [
    {
      name: 'latin',
      path: 'fonts/plex-latin.woff2',
      bytes: new Uint8Array(3000),
      codepoints: 200,
      unicodeRange: 'U+0-ff',
    },
    {
      name: 'cyrillic',
      path: 'fonts/plex-cyrillic.woff2',
      bytes: new Uint8Array(4000),
      codepoints: 200,
      unicodeRange: 'U+400-45f',
    },
  ],
  bytesServed: 3000,
  warnings: [],
  ...over,
});

const text = (over: Partial<TextOutcome> = {}): TextOutcome => ({
  inputPath: 'site.css',
  kind: 'css',
  bytesBefore: 5000,
  bytesAfter: 3000,
  minified: new Uint8Array(3000),
  siblings: [{ path: 'site.css.gz', bytes: new Uint8Array(900), encoding: 'gzip' }],
  bytesTransport: 900,
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

const lineFor = (rows: Row[], kind: string) =>
  summarise(rows).lines.find((l) => l.kind === kind);

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

describe('summarise - images', () => {
  it('measures the saving against the served file, not the sum of every output', () => {
    const line = lineFor([row({ outcome: outcome() })], 'image')!;
    expect(line.before).toBe(1000);
    expect(line.served).toBe(120); // the AVIF a browser takes
    expect(line.emitted).toBe(760); // everything in the zip
  });

  it('counts a skipped file at its original size, since it is copied through', () => {
    const rows = [row({ outcome: outcome({ skipped: 'Could not read this file.', variants: [] }) })];
    const line = lineFor(rows, 'image')!;
    expect(line.skipped).toBe(1);
    expect(line.served).toBe(1000);
    expect(line.emitted).toBe(1000);
  });
});

describe('summarise - fonts', () => {
  it('counts only the first slice as served, because that is what a page fetches', () => {
    const line = lineFor([row({ font: font() })], 'font')!;
    expect(line.before).toBe(15000);
    expect(line.served).toBe(3000); // latin only
    expect(line.emitted).toBe(7000); // latin + cyrillic
  });

  it('falls back to the original size when the font was skipped', () => {
    const rows = [row({ font: font({ skipped: 'Not a font file.', slices: [] }) })];
    const line = lineFor(rows, 'font')!;
    expect(line.skipped).toBe(1);
    expect(line.served).toBe(15000);
  });
});

describe('summarise - text', () => {
  it('reports the transport size, which is what a configured server sends', () => {
    const line = lineFor([row({ text: text() })], 'css')!;
    expect(line.before).toBe(5000);
    expect(line.served).toBe(900); // the gzip sibling
    expect(line.emitted).toBe(3900); // minified plus the sibling
  });

  it('breaks the four text types out separately', () => {
    const report = summarise([
      row({ asset: asset('a.css', 10, 'css'), text: text({ kind: 'css' }) }),
      row({ asset: asset('a.js', 10, 'js'), text: text({ kind: 'js' }) }),
      row({ asset: asset('a.html', 10, 'html'), text: text({ kind: 'html' }) }),
      row({ asset: asset('a.svg', 10, 'svg'), text: text({ kind: 'svg' }) }),
    ]);
    expect(report.lines.map((l) => l.kind)).toEqual(['css', 'js', 'html', 'svg']);
  });

  it('still counts a file whose minified form was rejected for being larger', () => {
    const rows = [
      row({ text: text({ skipped: 'Already as small as it gets - the original was kept.' }) }),
    ];
    expect(lineFor(rows, 'css')!.skipped).toBe(1);
  });
});

describe('summarise - across kinds', () => {
  it('orders the breakdown and totals it consistently', () => {
    const report = summarise([
      row({ outcome: outcome() }),
      row({ asset: asset('f.woff2', 10, 'font'), font: font() }),
      row({ asset: asset('a.css', 10, 'css'), text: text() }),
    ]);

    expect(report.lines.map((l) => l.kind)).toEqual(['image', 'font', 'css']);
    expect(report.bytesBefore).toBe(1000 + 15000 + 5000);
    expect(report.bytesServed).toBe(120 + 3000 + 900);
    expect(report.files).toBe(3);
  });

  it('adds up warnings and stripped metadata across the run', () => {
    const report = summarise([
      row({ outcome: outcome({ warnings: ['a', 'b'], metadataRemoved: 128 }) }),
      row({ asset: asset('f.woff2', 10, 'font'), font: font({ warnings: ['c'] }) }),
      row({ asset: asset('a.css', 10, 'css'), text: text({ warnings: ['d'] }) }),
    ]);
    expect(report.warnings).toBe(4);
    expect(report.metadataRemoved).toBe(128);
  });

  it('leaves files with no pipeline out of the totals', () => {
    const report = summarise([row({ asset: asset('notes.txt', 5000, 'other') })]);
    expect(report.files).toBe(1);
    expect(report.lines).toEqual([]);
    expect(report.bytesBefore).toBe(0);
  });
});

describe('buildZip', () => {
  it('writes every image variant at its own path and keeps folder structure', async () => {
    const zip = await unzipBlob(
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

  it('writes one file per font slice', async () => {
    const zip = await unzipBlob(
      buildZip([row({ asset: asset('fonts/plex.woff2', 15000, 'font'), font: font() })]),
    );
    expect(Object.keys(zip).sort()).toEqual([
      'fonts/plex-cyrillic.woff2',
      'fonts/plex-latin.woff2',
    ]);
  });

  it('keeps the original name for minified text and adds the compressed siblings', async () => {
    const zip = await unzipBlob(
      buildZip([row({ asset: asset('site.css', 5000, 'css'), text: text() })]),
    );
    expect(Object.keys(zip).sort()).toEqual(['site.css', 'site.css.gz']);
    // Dropping in over the original is the whole point; a renamed file would
    // need every reference rewritten, which is Phase 4 and gated on Law 3.
    expect(zip['site.css']!.byteLength).toBe(3000);
  });

  it('copies through anything the pipeline did not touch', async () => {
    const zip = await unzipBlob(
      buildZip([
        row({ asset: asset('notes.txt', 20, 'other') }),
        row({ asset: asset('broken.jpg', 30), outcome: outcome({ variants: [], skipped: 'no' }) }),
      ]),
    );
    expect(Object.keys(zip).sort()).toEqual(['broken.jpg', 'notes.txt']);
    expect(zip['notes.txt']!.byteLength).toBe(20);
  });

  it('omits snippets.html when nothing generated markup', async () => {
    const zip = await unzipBlob(buildZip([row({ asset: asset('a.txt', 10, 'other') })]));
    expect(zip['snippets.html']).toBeUndefined();
  });
});

describe('snippetsDocument', () => {
  it('lists the markup, then what was left alone and why', async () => {
    const doc = snippetsDocument([
      row({ snippet: '<picture>A</picture>', outcome: outcome({ warnings: ['a note'] }) }),
      row({
        asset: asset('bad.jpg', 10),
        outcome: outcome({ variants: [], skipped: 'It was copied unchanged.' }),
      }),
    ]);

    expect(doc).toContain('<picture>A</picture>');
    expect(doc).toContain('Files left unchanged:');
    expect(doc).toContain('It was copied unchanged.');
    expect(doc).toContain('a note');
  });

  it('explains the compressed siblings only when there are some', async () => {
    const withGz = snippetsDocument([
      row({ asset: asset('a.css', 10, 'css'), text: text(), snippet: '<picture>x</picture>' }),
    ]);
    expect(withGz).toContain('.gz and .br');

    const without = snippetsDocument([row({ snippet: '<picture>x</picture>' })]);
    expect(without).not.toContain('.gz and .br');
  });

  it('surfaces a font warning next to the file it came from', async () => {
    const doc = snippetsDocument([
      row({
        asset: asset('fonts/plex.woff2', 10, 'font'),
        font: font({ warnings: ['Kept 40 of 400 characters.'] }),
        snippet: '@font-face{}',
      }),
    ]);
    expect(doc).toContain('fonts/plex.woff2 - Kept 40 of 400 characters.');
  });

  it('round-trips as UTF-8 through the zip', async () => {
    const zip = await unzipBlob(buildZip([row({ snippet: '<picture>—</picture>' })]));
    expect(strFromU8(zip['snippets.html']!)).toContain('<picture>—</picture>');
  });
});
