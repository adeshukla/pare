import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  coveredCodepoints,
  decodeWoff,
  detectContainer,
  familyName,
  fontStyle,
  readTables,
} from '../../src/lib/sfnt';

/**
 * Run against a real IBM Plex Mono, not a synthetic font. The tables these
 * functions read are exactly the ones that are fiddly in the wild.
 */
const font = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/fonts/${name}`));

const TTF = font('plex-mono.ttf');
const WOFF = font('plex-mono.woff');
const WOFF2 = font('plex-mono.woff2');

describe('detectContainer', () => {
  it('recognises each wrapper by its signature', () => {
    expect(detectContainer(TTF)).toBe('ttf');
    expect(detectContainer(WOFF)).toBe('woff');
    expect(detectContainer(WOFF2)).toBe('woff2');
  });

  it('returns nothing for a file that is not a font', () => {
    expect(detectContainer(new Uint8Array(readFileSync('tests/fixtures/photo.jpg')))).toBeUndefined();
    expect(detectContainer(new Uint8Array([1, 2]))).toBeUndefined();
  });
});

describe('decodeWoff', () => {
  it('rebuilds an sfnt the rest of the pipeline can read', async () => {
    const sfnt = await decodeWoff(WOFF);

    expect(detectContainer(sfnt)).toBe('ttf');
    // The unwrapped font is bigger than the compressed wrapper it came from.
    expect(sfnt.byteLength).toBeGreaterThan(WOFF.byteLength);
    expect(readTables(sfnt).length).toBeGreaterThan(5);
  });

  it('recovers every table the wrapper carried', async () => {
    const sfnt = await decodeWoff(WOFF);
    const tags = readTables(sfnt).map((t) => t.tag);

    // The WOFF and WOFF2 builds of this family do not ship an identical table
    // set - the WOFF2 keeps the hinting tables and the WOFF drops them - so this
    // checks the essentials plus the layout tables, not equality with the TTF.
    for (const required of ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'OS/2']) {
      expect(tags).toContain(required);
    }
    expect(tags).toContain('GSUB');
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('produces a font whose name and coverage still parse', async () => {
    const sfnt = await decodeWoff(WOFF);
    expect(familyName(sfnt)).toBe(familyName(TTF));
    expect(coveredCodepoints(sfnt).size).toBe(coveredCodepoints(TTF).size);
  });

  it('refuses anything that is not a WOFF instead of producing rubbish', async () => {
    await expect(decodeWoff(TTF)).rejects.toThrow(/not a WOFF/);
  });
});

describe('readTables', () => {
  it('finds the tables a font must have', () => {
    const tags = readTables(TTF).map((t) => t.tag);
    for (const required of ['cmap', 'head', 'hhea', 'maxp', 'name']) {
      expect(tags).toContain(required);
    }
  });

  it('returns nothing for a file too short to hold a directory', () => {
    expect(readTables(new Uint8Array(4))).toEqual([]);
  });
});

describe('familyName', () => {
  it('reads the family the font declares, not the filename', () => {
    // The fixture is called plex-mono.ttf; the font calls itself this.
    expect(familyName(TTF)).toBe('IBM Plex Mono');
  });

  it('gives up quietly on a font with no name table', () => {
    expect(familyName(new Uint8Array(12))).toBeUndefined();
  });
});

describe('fontStyle', () => {
  it('reads weight and slant from OS/2', () => {
    expect(fontStyle(TTF)).toEqual({ weight: 400, italic: false });
  });

  it('falls back to a sane default rather than emitting a wrong @font-face', () => {
    expect(fontStyle(new Uint8Array(12))).toEqual({ weight: 400, italic: false });
  });
});

describe('coveredCodepoints', () => {
  const covered = coveredCodepoints(TTF);

  it('reports the characters the font can actually draw', () => {
    expect(covered.size).toBeGreaterThan(100);
    for (const char of 'Pare 0123456789') {
      expect(covered.has(char.codePointAt(0)!)).toBe(true);
    }
  });

  it('does not claim characters the font has no glyph for', () => {
    // The fixture is the Latin subset, so Cyrillic and CJK are genuinely absent.
    expect(covered.has(0x044f)).toBe(false); // я
    expect(covered.has(0x4e00)).toBe(false); // 一
  });

  it('returns an empty set rather than throwing on a font with no cmap', () => {
    expect(coveredCodepoints(new Uint8Array(12)).size).toBe(0);
  });
});
