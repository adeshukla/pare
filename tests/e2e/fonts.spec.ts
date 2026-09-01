import { expect, test } from '@playwright/test';

/**
 * Font fixture tests, run against the real hb-subset and WOFF2 codecs in a browser.
 *
 * The unit suite covers the container and table parsing; what can only be proved
 * here is that the WASM subsetter produces a font that is smaller and still
 * loads, and that splitting by script loses no glyphs.
 */

type Codecs = {
  subsetFont: (sfnt: Uint8Array, codepoints: number[]) => Promise<Uint8Array>;
  toWoff2: (sfnt: Uint8Array) => Promise<Uint8Array>;
  fromWoff2: (woff2: Uint8Array) => Promise<Uint8Array>;
};

type Sfnt = {
  coveredCodepoints: (sfnt: Uint8Array) => Set<number>;
  familyName: (sfnt: Uint8Array) => string | undefined;
  detectContainer: (bytes: Uint8Array) => string | undefined;
};

type Ranges = {
  partition: (covered: Set<number>) => Array<{ name: string; codepoints: number[] }>;
};

declare global {
  interface Window {
    __fonts?: Codecs;
    __sfnt?: Sfnt;
    __ranges?: Ranges;
    __fixture?: (name: string) => Promise<Uint8Array>;
  }
}

/** Held as values so TypeScript treats these as runtime URLs, not modules to resolve. */
const MODULES = {
  fonts: '/src/workers/font-codecs.ts',
  sfnt: '/src/lib/sfnt.ts',
  ranges: '/src/lib/unicode-ranges.ts',
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (mods) => {
    window.__fonts = (await import(/* @vite-ignore */ mods.fonts)) as unknown as Codecs;
    window.__sfnt = (await import(/* @vite-ignore */ mods.sfnt)) as unknown as Sfnt;
    window.__ranges = (await import(/* @vite-ignore */ mods.ranges)) as unknown as Ranges;
    window.__fixture = async (name: string) => {
      const res = await fetch(`/tests/fixtures/fonts/${name}`);
      if (!res.ok) throw new Error(`fixture ${name} not served: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    };
  }, MODULES);
});

test('unpacks a WOFF2 into a font the parser can read', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const woff2 = await window.__fixture!('plex-mono.woff2');
    const sfnt = await window.__fonts!.fromWoff2(woff2);
    return {
      container: window.__sfnt!.detectContainer(sfnt),
      family: window.__sfnt!.familyName(sfnt),
      covered: window.__sfnt!.coveredCodepoints(sfnt).size,
    };
  });

  expect(out.container).toBe('ttf');
  expect(out.family).toBe('IBM Plex Mono');
  expect(out.covered).toBeGreaterThan(100);
});

test('a subset is smaller and keeps exactly the characters asked for', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const woff2 = await window.__fixture!('plex-mono.woff2');
    const sfnt = await window.__fonts!.fromWoff2(woff2);
    const wanted = [...'Pare optimizes assets'].map((c) => c.codePointAt(0)!);

    const subset = await window.__fonts!.subsetFont(sfnt, wanted);
    const covered = window.__sfnt!.coveredCodepoints(subset);

    return {
      before: sfnt.byteLength,
      after: subset.byteLength,
      missing: wanted.filter((cp) => !covered.has(cp)),
      coveredCount: covered.size,
    };
  });

  expect(out.after).toBeLessThan(out.before);
  // Every character we asked to keep must be there. A subset that drops a
  // requested glyph is a broken page.
  expect(out.missing).toEqual([]);
  expect(out.coveredCount).toBeLessThan(200);
});

test('the subset survives WOFF2 compression and reloads intact', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const original = await window.__fixture!('plex-mono.woff2');
    const sfnt = await window.__fonts!.fromWoff2(original);
    const wanted = [...'Pare 0123456789'].map((c) => c.codePointAt(0)!);

    const subset = await window.__fonts!.subsetFont(sfnt, wanted);
    const packed = await window.__fonts!.toWoff2(subset);
    const unpacked = await window.__fonts!.fromWoff2(packed);
    const covered = window.__sfnt!.coveredCodepoints(unpacked);

    return {
      originalWoff2: original.byteLength,
      subsetWoff2: packed.byteLength,
      missing: wanted.filter((cp) => !covered.has(cp)),
      family: window.__sfnt!.familyName(unpacked),
    };
  });

  expect(out.subsetWoff2).toBeLessThan(out.originalWoff2);
  expect(out.missing).toEqual([]);
  expect(out.family).toBe('IBM Plex Mono');
});

test('a real webfont shrinks well past the 60% the roadmap asks for', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const original = await window.__fixture!('plex-mono.woff2');
    const sfnt = await window.__fonts!.fromWoff2(original);
    const wanted = [...'Pare optimizes assets in your browser. 0123456789'].map(
      (c) => c.codePointAt(0)!,
    );
    const packed = await window.__fonts!.toWoff2(await window.__fonts!.subsetFont(sfnt, wanted));
    return { before: original.byteLength, after: packed.byteLength };
  });

  const cut = Math.floor((1 - out.after / out.before) * 100);
  expect(cut).toBeGreaterThan(60);
});

test('splitting by script loses no glyphs at all', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const sfnt = await window.__fonts!.fromWoff2(await window.__fixture!('plex-mono.woff2'));
    const covered = window.__sfnt!.coveredCodepoints(sfnt);
    const buckets = window.__ranges!.partition(covered);

    // Subset once per bucket, then check the union of what came back still
    // covers everything the original font could draw.
    const union = new Set<number>();
    let total = 0;
    for (const bucket of buckets) {
      const slice = await window.__fonts!.subsetFont(sfnt, bucket.codepoints);
      total += (await window.__fonts!.toWoff2(slice)).byteLength;
      for (const cp of window.__sfnt!.coveredCodepoints(slice)) union.add(cp);
    }

    const lost = [...covered].filter((cp) => !union.has(cp));
    return { buckets: buckets.length, lost: lost.length, total };
  });

  // This is the property that makes splitting safe under Law 2.
  expect(out.lost).toBe(0);
  expect(out.buckets).toBeGreaterThan(0);
});

test('refuses a file that is not a font instead of emitting rubbish', async ({ page }) => {
  const failed = await page.evaluate(async () => {
    const notAFont = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    try {
      await window.__fonts!.subsetFont(notAFont, [65]);
      return false;
    } catch {
      return true;
    }
  });

  expect(failed).toBe(true);
});
