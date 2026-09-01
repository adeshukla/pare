import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromBytes, fromText, union, withSafetyFloor } from '../../src/lib/codepoints';
import { fontFaceSnippet } from '../../src/lib/font-snippet';
import { coveredCodepoints } from '../../src/lib/sfnt';
import {
  coveredBy,
  formatUnicodeRange,
  partition,
  RANGES,
  spanContains,
} from '../../src/lib/unicode-ranges';

const cp = (s: string) => s.codePointAt(0)!;

describe('codepoints.fromText', () => {
  it('collects every character it is given', () => {
    const found = fromText('Pare');
    expect([...found].sort((a, b) => a - b)).toEqual(['P', 'a', 'r', 'e'].map(cp).sort((a, b) => a - b));
  });

  it('sees characters hidden behind CSS escapes', () => {
    // content: "\2713" renders a check mark that a plain scan would miss.
    expect(fromText('.a::before { content: "\\2713"; }').has(0x2713)).toBe(true);
  });

  it('sees characters hidden behind HTML entities', () => {
    const found = fromText('<p>&#8212; &#x2713; &copy;</p>');
    expect(found.has(0x2014)).toBe(true); // em dash, decimal
    expect(found.has(0x2713)).toBe(true); // check mark, hex
  });

  it('handles characters outside the BMP without splitting them', () => {
    expect(fromText('🙂').has(0x1f642)).toBe(true);
  });

  it('ignores an escape that is not a real character', () => {
    expect(() => fromText('\\110000 ')).not.toThrow();
  });
});

describe('codepoints.fromBytes', () => {
  it('reads a real stylesheet', () => {
    const found = fromBytes(new Uint8Array(readFileSync('tests/fixtures/text/site.css')));
    expect(found.has(cp('c'))).toBe(true);
    expect(found.has(cp('{'))).toBe(true);
  });

  it('does not throw on bytes that are not valid UTF-8', () => {
    expect(() => fromBytes(new Uint8Array([0xff, 0xfe, 0x00]))).not.toThrow();
  });
});

describe('codepoints.withSafetyFloor', () => {
  it('always keeps printable ASCII, whatever the scan found', () => {
    const floor = withSafetyFloor(new Set([cp('é')]));
    for (const char of 'abcXYZ0189 .,-?!@#') {
      expect(floor.has(cp(char))).toBe(true);
    }
    // and does not lose what was already there
    expect(floor.has(cp('é'))).toBe(true);
  });
});

describe('codepoints.union', () => {
  it('merges sets without duplicating', () => {
    const merged = union([new Set([1, 2]), new Set([2, 3]), new Set()]);
    expect([...merged].sort()).toEqual([1, 2, 3]);
  });
});

describe('unicode ranges', () => {
  it('places common characters in the range they belong to', () => {
    const latin = RANGES.find((r) => r.name === 'latin')!;
    const cyrillic = RANGES.find((r) => r.name === 'cyrillic')!;
    expect(spanContains(latin, cp('A'))).toBe(true);
    expect(spanContains(latin, cp('я'))).toBe(false);
    expect(spanContains(cyrillic, cp('я'))).toBe(true);
  });

  it('reports only what a given font actually covers', () => {
    const latin = RANGES.find((r) => r.name === 'latin')!;
    const covered = new Set([cp('A'), cp('B'), 0x4e00]);
    expect(coveredBy(latin, covered)).toEqual([cp('A'), cp('B')]);
  });
});

describe('partition', () => {
  it('assigns each codepoint to exactly one bucket', () => {
    const covered = new Set([cp('A'), cp('é'), cp('я'), cp('α')]);
    const buckets = partition(covered);
    const all = buckets.flatMap((b) => b.codepoints);
    expect(all.length).toBe(new Set(all).size);
    expect(new Set(all)).toEqual(covered);
  });

  it('loses nothing - every glyph ends up in some file', () => {
    // This is what makes splitting safe under Law 2. An unnamed script such as
    // Devanagari has to land in the leftover bucket, not disappear.
    const covered = new Set([cp('A'), 0x0905, 0x4e00]);
    const buckets = partition(covered);
    const all = new Set(buckets.flatMap((b) => b.codepoints));
    expect(all).toEqual(covered);
    expect(buckets.some((b) => b.name === 'other')).toBe(true);
  });

  it('splits a real font into named ranges', () => {
    const ttf = new Uint8Array(readFileSync('tests/fixtures/fonts/plex-mono.ttf'));
    const buckets = partition(coveredCodepoints(ttf));
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets[0]!.name).toBe('latin');
    // Nothing is dropped on the way through.
    const total = buckets.reduce((n, b) => n + b.codepoints.length, 0);
    expect(total).toBe(coveredCodepoints(ttf).size);
  });

  it('emits no empty buckets', () => {
    for (const bucket of partition(new Set([cp('A')]))) {
      expect(bucket.codepoints.length).toBeGreaterThan(0);
    }
  });
});

describe('formatUnicodeRange', () => {
  it('collapses runs into spans', () => {
    expect(formatUnicodeRange([0x41, 0x42, 0x43])).toBe('U+41-43');
  });

  it('keeps single codepoints single', () => {
    expect(formatUnicodeRange([0x41, 0x50])).toBe('U+41, U+50');
  });

  it('mixes runs and singles in order', () => {
    expect(formatUnicodeRange([0x50, 0x41, 0x42, 0x43])).toBe('U+41-43, U+50');
  });

  it('de-duplicates', () => {
    expect(formatUnicodeRange([0x41, 0x41, 0x42])).toBe('U+41-42');
  });

  it('has nothing to say about an empty set', () => {
    expect(formatUnicodeRange([])).toBe('');
  });
});

describe('fontFaceSnippet', () => {
  const base = {
    family: 'IBM Plex Mono',
    weight: 400,
    italic: false,
    display: 'swap' as const,
    preload: true,
    slices: [
      { path: 'fonts/plex-latin.woff2', unicodeRange: 'U+0-ff', name: 'latin' },
      { path: 'fonts/plex-cyrillic.woff2', unicodeRange: 'U+400-45f', name: 'cyrillic' },
    ],
  };

  const css = fontFaceSnippet(base);

  it('declares the family the font actually reports', () => {
    expect(css).toContain('font-family: "IBM Plex Mono";');
  });

  it('carries weight and style so the browser does not synthesise them', () => {
    expect(css).toContain('font-weight: 400;');
    expect(css).toContain('font-style: normal;');
    expect(fontFaceSnippet({ ...base, italic: true, weight: 700 })).toContain('font-style: italic;');
  });

  it('emits one @font-face per slice, each with its own unicode-range', () => {
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain('unicode-range: U+0-ff;');
    expect(css).toContain('unicode-range: U+400-45f;');
  });

  it('preloads only the first slice', () => {
    // Preloading every range would fetch the scripts the visitor cannot read,
    // which is the opposite of why the font was split.
    expect(css.match(/rel="preload"/g)).toHaveLength(1);
    expect(css).toContain('fonts/plex-latin.woff2" as="font"');
  });

  it('leaves the preload out when it is turned off', () => {
    expect(fontFaceSnippet({ ...base, preload: false })).not.toContain('preload');
  });

  it('omits unicode-range for a font that was not split', () => {
    const whole = fontFaceSnippet({
      ...base,
      slices: [{ path: 'fonts/plex.woff2', unicodeRange: '', name: 'whole font' }],
    });
    expect(whole).not.toContain('unicode-range');
  });

  it('escapes a family name that would otherwise close the CSS string', () => {
    const nasty = fontFaceSnippet({
      ...base,
      family: 'Ha"; } body { display:none } @font-face { x:"',
    });

    // The payload is still present, but every quote in it is escaped, so it
    // stays one string literal and never becomes a rule of its own.
    const declaration = nasty.split('\n').find((l) => l.includes('font-family:'))!;
    expect(declaration).toContain('\\"');
    expect(declaration.match(/(?<!\\)"/g)).toHaveLength(2);
  });

  it('has nothing to emit when no file was produced', () => {
    expect(fontFaceSnippet({ ...base, slices: [] })).toBe('');
  });
});
