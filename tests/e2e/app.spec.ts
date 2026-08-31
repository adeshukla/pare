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
 */

const FIXTURES = 'tests/fixtures';

async function choose(page: import('@playwright/test').Page, ...names: string[]) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(names.map((n) => `${FIXTURES}/${n}`));
  await expect(page.getByRole('button', { name: /^Optimize/ })).toBeVisible();
}

test('optimizes a photo and reports an honest saving', async ({ page }) => {
  await choose(page, 'photo.jpg');

  await page.getByRole('button', { name: /^Optimize 1 image$/ }).click();

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

  await page.getByRole('button', { name: 'photo.jpg' }).click();

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

  await page.getByRole('button', { name: 'photo.jpg' }).click();
  const snippet = page.locator('pre');
  await expect(snippet).toContainText('type="image/webp"');
  await expect(snippet).not.toContainText('type="image/avif"');
});

test('a damaged file is skipped with a plain-language reason, and the run continues', async ({
  page,
}) => {
  await choose(page, 'photo.jpg', 'broken.jpg');

  await page.getByRole('button', { name: /^Optimize 2 images$/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  // Law: one bad file must never fail a run.
  await expect(page.getByText(/Could not read this file/)).toBeVisible();
  await expect(page.getByText(/1 file was left unchanged/)).toBeVisible();
  await page.getByRole('button', { name: 'photo.jpg' }).click();
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

test('copies the snippet to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await choose(page, 'photo.jpg');
  await page.getByRole('button', { name: /^Optimize/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await page.getByRole('button', { name: 'photo.jpg' }).click();
  await page.getByRole('button', { name: 'Copy' }).click();
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
