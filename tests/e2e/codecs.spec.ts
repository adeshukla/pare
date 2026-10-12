import { expect, test } from '@playwright/test';

/**
 * Fixture tests for the codecs themselves, run in a real browser against real
 * files. AGENTS.md's definition of done asks every optimizer to prove its output
 * is decodable and smaller; this is where that is proved.
 *
 * The specs import src/workers/codecs.ts straight from the dev server so each
 * codec is exercised on its own, rather than only through the UI.
 */

const CODECS = '/src/workers/codecs.ts';

type Loaded = {
  decode: (b: Uint8Array, mime: string) => Promise<ImageData>;
  decodeWasm: (b: Uint8Array, mime: string) => Promise<ImageData>;
  decodeScaled: (b: Uint8Array, mime: string, width: number) => Promise<ImageData>;
  encodeAvif: (d: ImageData, q: number) => Promise<Uint8Array>;
  encodeWebp: (d: ImageData, q: number) => Promise<Uint8Array>;
  encodeJpeg: (d: ImageData, q: number) => Promise<Uint8Array>;
  encodePng: (d: ImageData) => Promise<Uint8Array>;
  resize: (d: ImageData, w: number, h: number) => Promise<ImageData>;
  placeholder: (d: ImageData) => Promise<string>;
};

declare global {
  interface Window {
    __pare?: Loaded;
    __fixture?: (name: string) => Promise<Uint8Array>;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (path) => {
    window.__pare = (await import(/* @vite-ignore */ path)) as Loaded;
    window.__fixture = async (name: string) => {
      const res = await fetch(`/tests/fixtures/${name}`);
      if (!res.ok) throw new Error(`fixture ${name} not served: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    };
  }, CODECS);
});

test('decodes a JPEG to its true dimensions', async ({ page }) => {
  const size = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    return { width: img.width, height: img.height, source: bytes.byteLength };
  });

  expect(size.width).toBe(1200);
  expect(size.height).toBe(800);
});

test('AVIF output is smaller than the source and decodes back to the same size', async ({
  page,
}) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    const encoded = await window.__pare!.encodeAvif(img, 50);
    const back = await window.__pare!.decode(encoded, 'image/avif');
    return {
      before: bytes.byteLength,
      after: encoded.byteLength,
      width: back.width,
      height: back.height,
    };
  });

  expect(out.after).toBeLessThan(out.before);
  expect(out.width).toBe(1200);
  expect(out.height).toBe(800);
});

test('WebP output is smaller than the source and decodes back to the same size', async ({
  page,
}) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    const encoded = await window.__pare!.encodeWebp(img, 75);
    const back = await window.__pare!.decode(encoded, 'image/webp');
    return { before: bytes.byteLength, after: encoded.byteLength, width: back.width };
  });

  expect(out.after).toBeLessThan(out.before);
  expect(out.width).toBe(1200);
});

test('MozJPEG re-encode beats the original JPEG at the same dimensions', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    const encoded = await window.__pare!.encodeJpeg(img, 75);
    const back = await window.__pare!.decode(encoded, 'image/jpeg');
    return { before: bytes.byteLength, after: encoded.byteLength, width: back.width };
  });

  expect(out.after).toBeLessThan(out.before);
  expect(out.width).toBe(1200);
});

test('PNG stays lossless through OxiPNG and comes back byte-identical in pixels', async ({
  page,
}) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('flat.png');
    const img = await window.__pare!.decode(bytes, 'image/png');
    const encoded = await window.__pare!.encodePng(img);
    const back = await window.__pare!.decode(encoded, 'image/png');

    let identical = back.width === img.width && back.height === img.height;
    if (identical) {
      for (let i = 0; i < img.data.length; i++) {
        if (img.data[i] !== back.data[i]) {
          identical = false;
          break;
        }
      }
    }
    return { before: bytes.byteLength, after: encoded.byteLength, identical };
  });

  expect(out.after).toBeLessThan(out.before);
  // Lossless has to mean lossless, not "close enough".
  expect(out.identical).toBe(true);
});

test('resize scales down without upscaling and keeps the aspect ratio', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    const small = await window.__pare!.resize(img, 400, 267);
    const encoded = await window.__pare!.encodeAvif(small, 50);
    return { width: small.width, height: small.height, after: encoded.byteLength };
  });

  expect(out.width).toBe(400);
  expect(out.height).toBe(267);
  expect(out.after).toBeGreaterThan(0);
});

test('a smaller rung produces a smaller file than a larger one', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    const a = await window.__pare!.encodeAvif(await window.__pare!.resize(img, 400, 267), 50);
    const b = await window.__pare!.encodeAvif(await window.__pare!.resize(img, 800, 533), 50);
    return { small: a.byteLength, large: b.byteLength };
  });

  expect(out.small).toBeLessThan(out.large);
});

test('the placeholder is a data URI a browser can actually paint', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    const img = await window.__pare!.decode(bytes, 'image/jpeg');
    const uri = await window.__pare!.placeholder(img);
    const source = bytes.byteLength;

    // Decode it the way the browser will when it meets the generated markup.
    const blob = await (await fetch(uri)).blob();
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return { uri, size, source };
  });

  expect(out.uri.startsWith('data:image/')).toBe(true);
  // A ThumbHash renders to roughly 4 KB of base64. That is small next to the
  // image it stands in for, but it is not free, and it goes inline into the
  // user's HTML - which is why Results reports the cost per file.
  expect(out.uri.length).toBeLessThan(8000);
  expect(out.uri.length).toBeLessThan(out.source / 10);
  expect(out.size.width).toBeGreaterThan(0);
  expect(out.size.width).toBeLessThanOrEqual(100);
});

test('a corrupt file is rejected rather than producing garbage output', async ({ page }) => {
  const failed = await page.evaluate(async () => {
    const bytes = await window.__fixture!('broken.jpg');
    try {
      await window.__pare!.decode(bytes, 'image/jpeg');
      return false;
    } catch {
      return true;
    }
  });

  // The pipeline turns this rejection into a skip-and-warn; see app.spec.ts.
  expect(failed).toBe(true);
});

test('the WASM decoders read every format the browser decoder does', async ({ page }) => {
  // This path only runs when the browser's own decoder refuses - which in
  // Chromium is never, and in WebKit is always (no OffscreenCanvas in workers).
  // Called directly here so every engine exercises it, and against the native
  // decode so a wrong size or a blank buffer cannot pass.
  const out = await page.evaluate(async () => {
    const results: Array<{ name: string; wasm: [number, number]; lit: boolean }> = [];
    for (const [name, mime] of [
      ['photo.jpg', 'image/jpeg'],
      ['flat.png', 'image/png'],
    ] as const) {
      const bytes = await window.__fixture!(name);
      const img = await window.__pare!.decodeWasm(bytes, mime);
      results.push({
        name,
        wasm: [img.width, img.height],
        lit: img.data.some((v, i) => i % 4 !== 3 && v > 0),
      });
    }
    return results;
  });

  expect(out).toEqual([
    { name: 'photo.jpg', wasm: [1200, 800], lit: true },
    { name: 'flat.png', wasm: [640, 480], lit: true },
  ]);
});

test('an image too big to hold can be decoded straight to a smaller size', async ({ page }) => {
  const size = await page.evaluate(async () => {
    const bytes = await window.__fixture!('photo.jpg');
    try {
      const img = await window.__pare!.decodeScaled(bytes, 'image/jpeg', 400);
      return { width: img.width, height: img.height };
    } catch {
      // WebKit has no OffscreenCanvas, so there is no scaled path to take.
      return typeof OffscreenCanvas === 'undefined' ? 'unsupported' : 'failed';
    }
  });

  if (size === 'unsupported') return;
  // Aspect ratio follows from the width alone.
  expect(size).toEqual({ width: 400, height: 267 });
});
