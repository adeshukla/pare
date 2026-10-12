import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBmp } from '../../src/lib/bmp';
import { classify } from '../../src/lib/classify';
import { buildGraph } from '../../src/lib/graph';
import { coveredCodepoints, decodeWoff, encodeWoff, readTables } from '../../src/lib/sfnt';
import type { Asset } from '../../src/lib/types';
import {
  esbuildTargets,
  nameSensitive,
  protectedHeader,
} from '../../src/workers/text-codecs';

/**
 * ADR-026 (HEIC and BMP), ADR-027 (server templates) and ADR-028 (how hard
 * JavaScript is minified, and for which browsers).
 */

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const enc = new TextEncoder();

describe('classify: HEIC, BMP and templates', () => {
  it('reads a real HEIC by its brands, whatever it is called', () => {
    expect(classify('IMG_0001.HEIC', fixture('photo.heic')).mime).toBe('image/heic');
    expect(classify('renamed.jpg', fixture('photo.heic')).mime).toBe('image/heic');
  });

  it('tells AVIF from HEIC when both use the generic mif1 brand', () => {
    const ftyp = (brands: string[]) => {
      const size = 8 + brands.length * 4 + 4;
      const b = new Uint8Array(size);
      new DataView(b.buffer).setUint32(0, size);
      b.set(enc.encode('ftyp'), 4);
      b.set(enc.encode(brands[0]!), 8);
      brands.slice(1).forEach((brand, i) => b.set(enc.encode(brand), 16 + i * 4));
      return b;
    };
    expect(classify('a', ftyp(['mif1', 'mif1', 'avif'])).mime).toBe('image/avif');
    expect(classify('a', ftyp(['mif1', 'mif1', 'heic'])).mime).toBe('image/heic');
    expect(classify('a', ftyp(['avif', 'mif1', 'miaf'])).mime).toBe('image/avif');
  });

  it('reads every BMP fixture, and does not mistake text starting with BM', () => {
    for (const name of ['gradient-24.bmp', 'palette-8.bmp', 'alpha-32.bmp']) {
      expect(classify(name, fixture(name)).mime).toBe('image/bmp');
    }
    expect(classify('notes.txt', enc.encode('BMW is a car brand, not a bitmap')).kind).toBe('other');
  });

  it('marks server templates as templates', () => {
    for (const name of ['index.php', 'single.blade.php', 'page.twig', 'layout.liquid', 'x.erb', 'a.njk']) {
      expect(classify(name, enc.encode('<p>x</p>')).kind).toBe('template');
    }
  });
});

describe('decodeBmp', () => {
  it('reads a bottom-up 24-bit file the right way up', () => {
    const { width, height, data } = decodeBmp(fixture('gradient-24.bmp'));
    expect([width, height]).toEqual([64, 48]);
    expect([...data.slice(0, 4)]).toEqual([0, 0, 128, 255]);
    const last = (width * height - 1) * 4;
    expect([...data.slice(last, last + 4)]).toEqual([255, 255, 128, 255]);
  });

  it('reads an 8-bit palette', () => {
    const { data } = decodeBmp(fixture('palette-8.bmp'));
    expect([...data.slice(0, 4)]).toEqual([0, 255, 0, 255]);
    // Palette entries are stored blue, green, red: bytes 16,239,8 are RGB 8,239,16.
    expect([...data.slice(4 * 4, 4 * 4 + 4)]).toEqual([8, 239, 16, 255]);
  });

  it('keeps real alpha from a 32-bit bit-field file', () => {
    const { data } = decodeBmp(fixture('alpha-32.bmp'));
    expect(data[3]).toBe(255);
    expect(data[(40 * 4) + 3]).toBe(96);
  });

  it('refuses rather than guesses', () => {
    expect(() => decodeBmp(enc.encode('BM not really'))).toThrow();
  });
});

describe('encodeWoff', () => {
  it('round-trips: every table comes back byte for byte', async () => {
    const ttf = fixture('fonts/plex-mono.ttf');
    const woff = await encodeWoff(ttf);
    expect(String.fromCharCode(...woff.slice(0, 4))).toBe('wOFF');
    expect(woff.byteLength).toBeLessThan(ttf.byteLength);

    const back = await decodeWoff(woff);
    const tables = (font: Uint8Array) =>
      new Map(readTables(font).map((t) => [t.tag, [...font.slice(t.offset, t.offset + t.length)].join()]));
    expect(tables(back)).toEqual(tables(ttf));
    expect(coveredCodepoints(back).size).toBe(coveredCodepoints(ttf).size);
  });
});

describe('templates pin what they mention (ADR-027)', () => {
  it('never lets a file a PHP template names be renamed', () => {
    const asset = (path: string, text: string, kind: Asset['kind']): Asset => ({
      path,
      bytes: enc.encode(text),
      kind,
      mime: 'text/plain',
      refs: [],
      resolvable: false,
    });
    const graph = buildGraph([
      asset('header.php', '<img src="<?php echo get_template_directory_uri(); ?>/img/logo.png">', 'template'),
      asset('style.css', '.a{background:url(img/logo.png)} .b{background:url(img/other.png)}', 'css'),
      asset('img/logo.png', 'x', 'image'),
      asset('img/other.png', 'x', 'image'),
    ]);
    expect(graph.renameable.has('img/logo.png')).toBe(false);
    expect(graph.renameable.has('img/other.png')).toBe(true);
    expect(graph.warnings.map((w) => w.message).join(' ')).toMatch(/header\.php mentions it/);
  });
});

describe('minification safety (ADR-028)', () => {
  it('keeps a WordPress theme header and licence notices', () => {
    const theme = '/*\nTheme Name: Twenty Pare\nVersion: 1.0\n*/\nbody { margin: 0 }';
    expect(protectedHeader(theme)).toContain('Theme Name: Twenty Pare');
    expect(protectedHeader('/*! MIT licence */ a{}')).toBe('/*! MIT licence */');
    expect(protectedHeader('/* just a note */ a{}')).toBeUndefined();
  });

  it('spots code that reads its own names', () => {
    expect(nameSensitive('angular.module("app").controller("C", function($scope) {})')).toMatch(/AngularJS/);
    expect(nameSensitive('var x = eval(code);')).toBe('eval()');
    expect(nameSensitive('fn.$inject = ["$http"];')).toMatch(/AngularJS/);
    expect(nameSensitive('function evaluate(a) { return a + 1 }')).toBeUndefined();
  });

  it('names every browser of a range, iOS included', () => {
    expect(esbuildTargets('legacy')).toEqual(['chrome61', 'firefox60', 'safari11', 'edge79', 'ios11']);
    expect(esbuildTargets('wide')).toContain('ios14');
  });
});
