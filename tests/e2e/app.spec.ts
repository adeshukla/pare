import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';

/**
 * The Phase 1 exit condition, as a test:
 *
 *   "a stranger drops 20 photos, gets optimized files and working markup,
 *    without reading instructions."
 *
 * So this walks the whole path a stranger walks - choose files, press the one
 * obvious button, read the number, copy the markup, take the zip.
 *
 * The later tests do the same for fonts and for code, which arrived in Phases 2
 * and 3 and share the same screen.
 */

const FIXTURES = 'tests/fixtures';

async function choose(page: import('@playwright/test').Page, ...names: string[]) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(names.map((n) => `${FIXTURES}/${n}`));
  await expect(page.getByRole('button', { name: /^Optimize/ })).toBeVisible();
}

test('optimizes a photo and reports an honest saving', async ({ page }) => {
  await choose(page, 'photo.jpg');

  await page.getByRole('button', { name: /^Optimize 1 file$/ }).click();

  const savings = page.getByLabel('Savings');
  await expect(savings).toBeVisible();
  await expect(savings).toContainText('% smaller');

  // The headline compares the served file against the original, so the "after"
  // number has to be genuinely smaller than the 175 KB source.
  await expect(savings).toContainText('KB');
  const text = (await savings.textContent()) ?? '';
  const percent = Number(text.match(/(\d+)% smaller/)?.[1] ?? '0');
  expect(percent).toBeGreaterThan(20);
  expect(percent).toBeLessThan(100);
});

test('produces paste-ready markup with the formats it actually emitted', async ({ page }) => {
  await choose(page, 'photo.jpg');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();

  const snippet = page.locator('pre');
  await expect(snippet).toContainText('<picture>');
  await expect(snippet).toContainText('type="image/avif"');
  await expect(snippet).toContainText('type="image/webp"');
  await expect(snippet).toContainText('srcset=');
  await expect(snippet).toContainText('sizes=');
  // width/height are what stop the page jumping as images load.
  await expect(snippet).toContainText('width="1200"');
  await expect(snippet).toContainText('height="800"');
  await expect(snippet).toContainText('loading="lazy"');
});

test('turning a format off removes it from the output and the markup', async ({ page }) => {
  await choose(page, 'photo.jpg');

  await page.getByRole('checkbox', { name: 'AVIF' }).uncheck();
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();
  const snippet = page.locator('pre');
  await expect(snippet).toContainText('type="image/webp"');
  await expect(snippet).not.toContainText('type="image/avif"');
});

test('a damaged file is skipped with a plain-language reason, and the run continues', async ({
  page,
}) => {
  await choose(page, 'photo.jpg', 'broken.jpg');

  await page.getByRole('button', { name: /^Optimize 2 files$/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  // Law: one bad file must never fail a run.
  await expect(page.getByText(/Could not read this file/)).toBeVisible();
  await expect(page.getByText(/1 file was left unchanged/)).toBeVisible();
  await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();
  await expect(page.locator('pre')).toContainText('<picture>');
});

test('the download is a zip holding every variant plus the snippets', async ({ page }) => {
  await choose(page, 'photo.jpg', 'flat.png');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);

  const path = await download.path();
  const zip = unzipSync(new Uint8Array(readFileSync(path)));
  const names = Object.keys(zip);

  expect(names).toContain('snippets.html');
  expect(names.some((n) => n.endsWith('.avif'))).toBe(true);
  expect(names.some((n) => n.endsWith('.webp'))).toBe(true);
  // The PNG stays a PNG - Pare does not silently change a lossless source.
  expect(names.some((n) => n.startsWith('flat-') && n.endsWith('.png'))).toBe(true);

  for (const [name, bytes] of Object.entries(zip)) {
    expect(bytes.byteLength, `${name} is empty`).toBeGreaterThan(0);
  }
});

test('copies the snippet to the clipboard', async ({ page, context, browserName }) => {
  // Playwright can only grant clipboard permission in Chromium. The Copy button
  // works in the other two - we just cannot pre-authorise the read-back, and a
  // test that clicks through a permission prompt tests the prompt, not Pare.
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await choose(page, 'photo.jpg');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('<picture>');
});

test('never sends a byte anywhere', async ({ page }) => {
  const offsite: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname !== 'localhost' && url.protocol !== 'data:' && url.protocol !== 'blob:') {
      offsite.push(r.url());
    }
  });

  await choose(page, 'photo.jpg');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  // Law 1. If this ever fails, the pitch is gone.
  expect(offsite).toEqual([]);
});


/* ------------------------------------------------------------------ *
 * Phase 2 - fonts
 * ------------------------------------------------------------------ */

test('splits a font by script and writes the @font-face to go with it', async ({ page }) => {
  await choose(page, 'fonts/plex-mono.woff2');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await page.getByRole('button', { name: 'plex-mono.woff2', exact: true }).click();
  const snippet = page.locator('pre');

  // The family comes from the font's own name table, not the filename.
  await expect(snippet).toContainText('font-family: "IBM Plex Mono"');
  await expect(snippet).toContainText('font-weight: 400');
  await expect(snippet).toContainText('format("woff2")');
  await expect(snippet).toContainText('unicode-range:');
  await expect(snippet).toContainText('rel="preload"');
});

test('warns when asked to keep only the characters it can see', async ({ page }) => {
  await choose(page, 'fonts/plex-mono.woff2');

  await page.getByRole('radio', { name: 'Keep only characters I use' }).check();
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  // Law 5: the one mode that can break a page has to say so, unprompted.
  await expect(page.getByText(/will not be in this font/)).toBeVisible();
});

test('keeps a whole font in one file when asked to', async ({ page }) => {
  await choose(page, 'fonts/plex-mono.woff2');

  await page.getByRole('radio', { name: 'Keep everything in one file' }).check();
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await page.getByRole('button', { name: 'plex-mono.woff2', exact: true }).click();
  const snippet = page.locator('pre');
  await expect(snippet).toContainText('@font-face');
  // Nothing was split, so there is no range to declare.
  await expect(snippet).not.toContainText('unicode-range');
});

/* ------------------------------------------------------------------ *
 * Phase 3 - text
 * ------------------------------------------------------------------ */

test('minifies each text type and breaks the saving out per type', async ({ page }) => {
  await choose(page, 'text/site.css', 'text/app.js', 'text/page.html', 'text/logo.svg');

  // The drop contains a page, so Pare offers whole-site mode by default. This
  // test is about the per-type breakdown, which belongs to the files view.
  await page.getByRole('radio', { name: /Just give me optimized files/ }).check();
  await page.getByRole('button', { name: /^Optimize 4 files$/ }).click();

  const savings = page.getByLabel('Savings');
  await expect(savings).toBeVisible();

  // Phase 3's exit condition is a visible per-type breakdown.
  for (const label of ['CSS', 'JavaScript', 'HTML', 'SVG']) {
    await expect(savings.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(savings).toContainText('% smaller');
});

test('the zip carries the minified files under their original names', async ({ page }) => {
  await choose(page, 'text/site.css', 'text/app.js');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);

  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const names = Object.keys(zip).sort();

  // Same names, so they drop straight in over the originals.
  expect(names).toContain('site.css');
  expect(names).toContain('app.js');
  // gzip siblings are on by default.
  expect(names).toContain('site.css.gz');

  const css = new TextDecoder().decode(zip['site.css']!);
  expect(css.length).toBeLessThan(readFileSync('tests/fixtures/text/site.css', 'utf8').length);
  // ADR-002 holds all the way through to the download.
  expect(css).toContain('promo-banner--seasonal');
});

/* ------------------------------------------------------------------ *
 * Everything at once
 * ------------------------------------------------------------------ */

test('shows only the controls that apply to what was dropped', async ({ page }) => {
  await choose(page, 'photo.jpg');
  await expect(page.getByRole('region', { name: 'Images' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fonts' })).toBeHidden();

  await choose(page, 'photo.jpg', 'fonts/plex-mono.woff2', 'text/site.css');
  await expect(page.getByRole('region', { name: 'Images' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fonts' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'CSS, JavaScript, HTML and SVG' }),
  ).toBeVisible();
});

test('handles images, a font and code in one run', async ({ page }) => {
  await choose(page, 'photo.jpg', 'fonts/plex-mono.woff2', 'text/site.css', 'text/logo.svg');
  await page.getByRole('button', { name: /^Optimize 4 files$/ }).click();

  const savings = page.getByLabel('Savings');
  await expect(savings).toBeVisible();
  for (const label of ['Images', 'Fonts', 'CSS', 'SVG']) {
    await expect(savings.getByText(label, { exact: true })).toBeVisible();
  }

  // One snippet document covers both the <picture> and the @font-face.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const snippets = new TextDecoder().decode(zip['snippets.html']!);
  expect(snippets).toContain('<picture>');
  expect(snippets).toContain('@font-face');
});
