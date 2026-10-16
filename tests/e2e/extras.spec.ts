import { expect, test } from '@playwright/test';

/** Audit items 4 onward: the sample, the privacy mark, and what followed. */

test('the sample photo runs straight away and shows its location was removed', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.getByRole('button', { name: /Try it with a sample photo/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('sample-photo.jpg')).toBeVisible();
  await expect(page.getByText('Location removed')).toBeVisible();
  await expect(page.getByLabel('Savings')).toContainText('location is not in the file you download');
});

test('a photo keeps no mark when it had no location to remove', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Location removed')).toHaveCount(0);
});

test('the bug-report details name no file', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  test.setTimeout(150_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: /Try it with a sample photo/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });

  await page.getByRole('button', { name: 'Copy details for a bug report' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Files: 1 — 1 × image (image/jpeg)');
  expect(text).toContain('"output":"responsive"');
  expect(text).not.toContain('sample-photo');
});

test('the savings report downloads as one page', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.getByRole('button', { name: /Try it with a sample photo/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Savings report' }).click(),
  ]);
  expect(file.suggestedFilename()).toBe('pare-report.html');
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(await file.path(), 'utf8');
  expect(html).toContain('sample-photo.jpg');
  expect(html).toMatch(/\d+% smaller/);
});

test('a TIFF comes out as a JPEG every browser reads, and a second page is mentioned', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['tests/fixtures/gradient.tif', 'tests/fixtures/two-pages.tif']);
  await page.getByRole('button', { name: 'Optimize 2 files' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('This TIFF holds 2 pages; only the first was converted.')).toBeVisible();
  await page.getByRole('button', { name: 'gradient.tif', exact: true }).click();
  await expect(page.locator('pre').first()).toContainText('gradient-96.jpg');
});

test('an animated GIF becomes an animated WebP, with the GIF as fallback', async ({ page, browserName }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/animated.gif');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Kept as an animation \(10 frames\)/)).toBeVisible();

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);
  const { readFileSync } = await import('node:fs');
  const { unzipSync } = await import('fflate');
  const zip = unzipSync(new Uint8Array(readFileSync(await file.path())));
  const webp = zip['animated-160.webp']!;
  expect(zip['animated-160.gif']).toBeDefined();
  expect(Buffer.from(webp).includes('ANMF')).toBe(true);

  // The browser itself reads it as a 10-frame animation where it can say so.
  if (browserName === 'chromium') {
    const frames = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const decoder = new ImageDecoder({ data: bytes, type: 'image/webp' });
      await decoder.tracks.ready;
      return decoder.tracks.selectedTrack!.frameCount;
    }, Buffer.from(webp).toString('base64'));
    expect(frames).toBe(10);
  }
});

test('an animation that WebP cannot shrink keeps its GIF and says so', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/animated-flat.gif');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByText('An animated WebP came out no smaller than this GIF, so the GIF was kept unchanged.')).toBeVisible({ timeout: 60_000 });
});

test('JSON and XML lose their indentation and nothing else', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['{\n  "name": "Pare",\n  "icons": [ { "src": "/a b.png" } ]\n}\n'], 'app.webmanifest'));
    transfer.items.add(new File(['<?xml version="1.0"?>\n<urlset>\n  <url>\n    <loc>https://a.example/</loc>\n  </url>\n</urlset>\n'], 'sitemap.xml'));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Optimize 2 files' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Savings')).toContainText('JSON');
  await expect(page.getByLabel('Savings')).toContainText('XML');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);
  const { readFileSync } = await import('node:fs');
  const { unzipSync, strFromU8 } = await import('fflate');
  const zip = unzipSync(new Uint8Array(readFileSync(await file.path())));
  expect(strFromU8(zip['app.webmanifest']!)).toBe('{"name":"Pare","icons":[{"src":"/a b.png"}]}');
  expect(strFromU8(zip['sitemap.xml']!)).toBe('<?xml version="1.0"?><urlset><url><loc>https://a.example/</loc></url></urlset>');
});

test('one picture makes a whole icon set', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/tools/make-favicon/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg'); // 1200×800
  await expect(page.getByRole('radio', { name: 'App icons' })).toBeChecked();
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/the middle 800×800 of this 1200×800 picture was used/)).toBeVisible();

  await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();
  await expect(page.locator('pre').first()).toContainText('<link rel="manifest" href="/manifest.webmanifest">');

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);
  const { readFileSync } = await import('node:fs');
  const { unzipSync, strFromU8 } = await import('fflate');
  const zip = unzipSync(new Uint8Array(readFileSync(await file.path())));
  for (const name of ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest']) {
    expect(zip[name], name).toBeDefined();
  }
  const ico = zip['favicon.ico']!;
  expect(new DataView(ico.buffer, ico.byteOffset).getUint16(4, true)).toBe(3);
  expect(JSON.parse(strFromU8(zip['manifest.webmanifest']!)).name).toBe('photo');

  const sizes = await page.evaluate(async (files) => {
    const out: number[][] = [];
    for (const b64 of files) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      out.push([bitmap.width, bitmap.height]);
    }
    return out;
  }, ['apple-touch-icon.png', 'icon-192.png', 'icon-maskable-512.png'].map((n) => Buffer.from(zip[n]!).toString('base64')));
  expect(sizes).toEqual([[180, 180], [192, 192], [512, 512]]);
});
