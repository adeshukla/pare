/**
 * The Unicode ranges a webfont is worth splitting along.
 *
 * These mirror what Google Fonts serves, because that is what the `unicode-range`
 * descriptor was designed around and what browsers are well tested against.
 *
 * Splitting is the safe half of font optimization. Nothing is deleted: every
 * glyph the font had still exists, just spread across files that the browser
 * fetches only when a page actually uses that script. A page in English never
 * downloads the Cyrillic glyphs, and a page in Russian still renders correctly.
 * See ADR-011.
 */

export type UnicodeRange = {
  name: string;
  /** Inclusive [start, end] pairs. */
  spans: Array<[number, number]>;
};

export const RANGES: UnicodeRange[] = [
  {
    name: 'latin',
    spans: [
      [0x0000, 0x00ff],
      [0x0131, 0x0131],
      [0x0152, 0x0153],
      [0x02bb, 0x02bc],
      [0x02c6, 0x02c6],
      [0x02da, 0x02da],
      [0x02dc, 0x02dc],
      [0x2000, 0x206f],
      [0x2074, 0x2074],
      [0x20ac, 0x20ac],
      [0x2122, 0x2122],
      [0x2191, 0x2191],
      [0x2193, 0x2193],
      [0x2212, 0x2212],
      [0x2215, 0x2215],
      [0xfeff, 0xfeff],
      [0xfffd, 0xfffd],
    ],
  },
  {
    name: 'latin-ext',
    spans: [
      [0x0100, 0x02af],
      [0x0304, 0x0304],
      [0x0308, 0x0308],
      [0x0329, 0x0329],
      [0x1e00, 0x1e9f],
      [0x1ef2, 0x1eff],
      [0x2020, 0x2020],
      [0x20a0, 0x20ab],
      [0x20ad, 0x20cf],
      [0x2113, 0x2113],
      [0x2c60, 0x2c7f],
      [0xa720, 0xa7ff],
    ],
  },
  {
    name: 'vietnamese',
    spans: [
      [0x0102, 0x0103],
      [0x0110, 0x0111],
      [0x0128, 0x0129],
      [0x0168, 0x0169],
      [0x01a0, 0x01b0],
      [0x1ea0, 0x1ef9],
      [0x20ab, 0x20ab],
    ],
  },
  { name: 'greek', spans: [[0x0370, 0x03ff]] },
  {
    name: 'greek-ext',
    spans: [[0x1f00, 0x1fff]],
  },
  {
    name: 'cyrillic',
    spans: [
      [0x0301, 0x0301],
      [0x0400, 0x045f],
      [0x0490, 0x0491],
      [0x04b0, 0x04b1],
      [0x2116, 0x2116],
    ],
  },
  {
    name: 'cyrillic-ext',
    spans: [
      [0x0460, 0x052f],
      [0x1c80, 0x1c88],
      [0x20b4, 0x20b4],
      [0x2de0, 0x2dff],
      [0xa640, 0xa69f],
      [0xfe2e, 0xfe2f],
    ],
  },
];

export function spanContains(range: UnicodeRange, codepoint: number): boolean {
  return range.spans.some(([start, end]) => codepoint >= start && codepoint <= end);
}

/** Every codepoint in the range that this font can actually draw. */
export function coveredBy(range: UnicodeRange, covered: Set<number>): number[] {
  const out: number[] = [];
  for (const [start, end] of range.spans) {
    for (let cp = start; cp <= end; cp++) if (covered.has(cp)) out.push(cp);
  }
  return out;
}

/**
 * Split a font's coverage into ranges, plus one "other" bucket for anything the
 * named ranges miss.
 *
 * The leftover bucket is what keeps splitting lossless. Without it, a font
 * carrying Devanagari or emoji would quietly lose those glyphs, which is exactly
 * the deletion Law 2 forbids.
 */
export function partition(covered: Set<number>): Array<{ name: string; codepoints: number[] }> {
  const buckets: Array<{ name: string; codepoints: number[] }> = [];
  const claimed = new Set<number>();

  for (const range of RANGES) {
    const codepoints = coveredBy(range, covered).filter((cp) => !claimed.has(cp));
    if (codepoints.length === 0) continue;
    for (const cp of codepoints) claimed.add(cp);
    buckets.push({ name: range.name, codepoints });
  }

  const leftover = [...covered].filter((cp) => !claimed.has(cp)).sort((a, b) => a - b);
  if (leftover.length > 0) buckets.push({ name: 'other', codepoints: leftover });

  return buckets;
}

/** `U+0-ff, U+131, U+2000-206f` - collapsed to spans, as the descriptor wants. */
export function formatUnicodeRange(codepoints: number[]): string {
  if (codepoints.length === 0) return '';
  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const parts: string[] = [];
  const hex = (n: number) => n.toString(16);

  let start = sorted[0]!;
  let prev = start;

  for (let i = 1; i <= sorted.length; i++) {
    const cp = sorted[i];
    if (cp !== undefined && cp === prev + 1) {
      prev = cp;
      continue;
    }
    parts.push(start === prev ? `U+${hex(start)}` : `U+${hex(start)}-${hex(prev)}`);
    if (cp === undefined) break;
    start = cp;
    prev = cp;
  }

  return parts.join(', ');
}
