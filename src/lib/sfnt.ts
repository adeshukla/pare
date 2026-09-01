/**
 * Font containers and the two tables Pare needs to read.
 *
 * A font arrives in one of four wrappers. Three of them are handled here:
 *
 *   TTF / OTF   already an sfnt, nothing to do
 *   WOFF        sfnt with each table zlib-deflated - unwrapped natively below
 *   WOFF2       whole-font brotli with a transformed glyf; needs the WOFF2
 *               codec, so the worker unwraps that one (see font-codecs.ts)
 *
 * WOFF is decoded with `DecompressionStream('deflate')` rather than a library.
 * AGENTS.md asks for the native API where one exists, and for WOFF one does.
 */

export type FontContainer = 'ttf' | 'otf' | 'woff' | 'woff2';

const tag = (b: Uint8Array, off: number) =>
  String.fromCharCode(b[off] ?? 0, b[off + 1] ?? 0, b[off + 2] ?? 0, b[off + 3] ?? 0);

export function detectContainer(bytes: Uint8Array): FontContainer | undefined {
  const head = tag(bytes, 0);
  if (head === 'wOFF') return 'woff';
  if (head === 'wOF2') return 'woff2';
  if (head === 'OTTO') return 'otf';
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'ttf';
  if (head === 'true' || head === 'ttcf') return 'ttf';
  return undefined;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BufferSource])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Rebuild an sfnt from a WOFF wrapper. The table data is the same bytes a TTF
 * would hold; WOFF only deflates each table and rewrites the directory.
 */
export async function decodeWoff(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tag(bytes, 0) !== 'wOFF') throw new Error('not a WOFF file');

  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);

  type Entry = { tag: number; offset: number; compLength: number; origLength: number; checksum: number };
  const entries: Entry[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    entries.push({
      tag: view.getUint32(at),
      offset: view.getUint32(at + 4),
      compLength: view.getUint32(at + 8),
      origLength: view.getUint32(at + 12),
      checksum: view.getUint32(at + 16),
    });
  }

  const tables = await Promise.all(
    entries.map(async (e) => {
      const raw = bytes.subarray(e.offset, e.offset + e.compLength);
      // Equal lengths mean the table was stored uncompressed.
      return e.compLength === e.origLength ? raw : await inflate(raw);
    }),
  );

  const headerSize = 12 + numTables * 16;
  const padded = tables.map((t) => (4 - (t.byteLength % 4)) % 4);
  const total = headerSize + tables.reduce((n, t, i) => n + t.byteLength + padded[i]!, 0);

  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);

  // sfnt header. The binary-search fields are derived, not copied.
  const maxPower = Math.floor(Math.log2(numTables));
  outView.setUint32(0, flavor);
  outView.setUint16(4, numTables);
  outView.setUint16(6, 2 ** maxPower * 16);
  outView.setUint16(8, maxPower);
  outView.setUint16(10, numTables * 16 - 2 ** maxPower * 16);

  let at = headerSize;
  entries.forEach((entry, i) => {
    const table = tables[i]!;
    const record = 12 + i * 16;
    outView.setUint32(record, entry.tag);
    outView.setUint32(record + 4, entry.checksum);
    outView.setUint32(record + 8, at);
    outView.setUint32(record + 12, entry.origLength);
    out.set(table, at);
    at += table.byteLength + padded[i]!;
  });

  return out;
}

/* ------------------------------------------------------------------ *
 * Table directory
 * ------------------------------------------------------------------ */

export type Table = { tag: string; offset: number; length: number };

export function readTables(sfnt: Uint8Array): Table[] {
  if (sfnt.byteLength < 12) return [];
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const numTables = view.getUint16(4);
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16;
    if (at + 16 > sfnt.byteLength) break;
    tables.push({
      tag: tag(sfnt, at),
      offset: view.getUint32(at + 8),
      length: view.getUint32(at + 12),
    });
  }
  return tables;
}

/* ------------------------------------------------------------------ *
 * name - for the font-family in the generated @font-face
 * ------------------------------------------------------------------ */

/**
 * The family name as the font itself declares it. Guessing from the filename
 * gives you "ibm-plex-mono-latin-400-normal", which is not a font family.
 */
export function familyName(sfnt: Uint8Array): string | undefined {
  const table = readTables(sfnt).find((t) => t.tag === 'name');
  if (!table) return undefined;

  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const base = table.offset;
  if (base + 6 > sfnt.byteLength) return undefined;

  const count = view.getUint16(base + 2);
  const storage = base + view.getUint16(base + 4);

  let best: string | undefined;
  let bestRank = -1;

  for (let i = 0; i < count; i++) {
    const at = base + 6 + i * 12;
    if (at + 12 > sfnt.byteLength) break;
    const platform = view.getUint16(at);
    const nameId = view.getUint16(at + 6);
    const length = view.getUint16(at + 8);
    const offset = view.getUint16(at + 10);

    // 16 is the typographic family ("IBM Plex Mono"); 1 is the legacy family,
    // which splits weights into separate families on some fonts.
    if (nameId !== 1 && nameId !== 16) continue;
    const rank = (nameId === 16 ? 2 : 0) + (platform === 3 ? 1 : 0);
    if (rank <= bestRank) continue;

    const start = storage + offset;
    if (start + length > sfnt.byteLength) continue;
    const raw = sfnt.subarray(start, start + length);
    const text =
      platform === 3
        ? // Windows platform strings are UTF-16BE.
          Array.from({ length: Math.floor(raw.length / 2) }, (_, k) =>
            String.fromCharCode(((raw[k * 2] ?? 0) << 8) | (raw[k * 2 + 1] ?? 0)),
          ).join('')
        : String.fromCharCode(...raw);

    if (text.trim()) {
      best = text.trim();
      bestRank = rank;
    }
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * cmap - which codepoints the font can actually draw
 * ------------------------------------------------------------------ */

/**
 * Every codepoint the font has a glyph for.
 *
 * Needed for two things: deciding which Unicode ranges are worth splitting out,
 * and telling the user honestly what a subset kept versus what the font held.
 */
export function coveredCodepoints(sfnt: Uint8Array): Set<number> {
  const covered = new Set<number>();
  const table = readTables(sfnt).find((t) => t.tag === 'cmap');
  if (!table) return covered;

  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const base = table.offset;
  if (base + 4 > sfnt.byteLength) return covered;

  const numSubtables = view.getUint16(base + 2);
  let chosen = -1;
  let chosenRank = -1;

  for (let i = 0; i < numSubtables; i++) {
    const at = base + 4 + i * 8;
    if (at + 8 > sfnt.byteLength) break;
    const platform = view.getUint16(at);
    const encoding = view.getUint16(at + 2);
    const offset = view.getUint32(at + 4);

    // Prefer full Unicode (3,10 / 0,4+) over the BMP-only tables.
    let rank = -1;
    if (platform === 3 && encoding === 10) rank = 4;
    else if (platform === 0 && encoding >= 4) rank = 3;
    else if (platform === 3 && encoding === 1) rank = 2;
    else if (platform === 0) rank = 1;
    if (rank > chosenRank) {
      chosenRank = rank;
      chosen = base + offset;
    }
  }

  if (chosen < 0 || chosen + 4 > sfnt.byteLength) return covered;
  const format = view.getUint16(chosen);

  if (format === 4) readFormat4(view, chosen, sfnt.byteLength, covered);
  else if (format === 12) readFormat12(view, chosen, sfnt.byteLength, covered);

  return covered;
}

function readFormat4(view: DataView, at: number, limit: number, out: Set<number>) {
  const segCountX2 = view.getUint16(at + 6);
  const segCount = segCountX2 / 2;
  const endsAt = at + 14;
  const startsAt = endsAt + segCountX2 + 2;
  if (startsAt + segCountX2 > limit) return;

  for (let s = 0; s < segCount; s++) {
    const end = view.getUint16(endsAt + s * 2);
    const start = view.getUint16(startsAt + s * 2);
    if (start > end || start === 0xffff) continue;
    // A segment can be enormous in a broken font; the cap keeps a bad file from
    // hanging the worker.
    for (let cp = start; cp <= end && cp - start < 0x10000; cp++) out.add(cp);
  }
}

function readFormat12(view: DataView, at: number, limit: number, out: Set<number>) {
  const numGroups = view.getUint32(at + 12);
  for (let g = 0; g < numGroups; g++) {
    const rec = at + 16 + g * 12;
    if (rec + 12 > limit) break;
    const start = view.getUint32(rec);
    const end = view.getUint32(rec + 4);
    if (start > end) continue;
    for (let cp = start; cp <= end && cp - start < 0x10000; cp++) out.add(cp);
  }
}

/* ------------------------------------------------------------------ *
 * OS/2 - weight and slant, so the generated @font-face matches the file
 * ------------------------------------------------------------------ */

export type FontStyle = { weight: number; italic: boolean };

/**
 * A wrong `font-weight` in @font-face is worse than none: the browser
 * synthesises a fake bold on top of a font that was already bold. These two
 * fields are the font's own answer.
 */
export function fontStyle(sfnt: Uint8Array): FontStyle {
  const fallback: FontStyle = { weight: 400, italic: false };
  const table = readTables(sfnt).find((t) => t.tag === 'OS/2');
  if (!table || table.offset + 64 > sfnt.byteLength) return fallback;

  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const weight = view.getUint16(table.offset + 4);
  const fsSelection = view.getUint16(table.offset + 62);

  return {
    // usWeightClass is nominally 1-1000; anything else means a broken table.
    weight: weight >= 1 && weight <= 1000 ? weight : 400,
    italic: (fsSelection & 0x01) !== 0,
  };
}
