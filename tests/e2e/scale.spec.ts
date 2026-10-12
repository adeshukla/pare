import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Phase 1's exit condition, taken literally:
 *
 *   "a stranger drops 20 photos, gets optimized files and working markup,
 *    without reading instructions."
 *
 * Every other test uses one or two files, which never puts the worker pool under
 * any real pressure. This one does: 20 photographs at default settings is 20
 * decodes and up to 300 encodes, queued across `hardwareConcurrency - 1` workers.
 * It is the only test that would notice a pool that drops a queued job, leaks a
 * worker, or runs out of memory partway through a batch.
 */

const PHOTO = readFileSync('tests/fixtures/photo.jpg').toString('base64');
const COUNT = 20;

test('twenty photos at once', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  // React renders after the load event; the input may not exist the moment goto returns.
  await page.locator('input[type=file]').waitFor({ state: 'attached' });

  await page.evaluate(
    ([base64, count]) => {
      const binary = atob(base64 as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const transfer = new DataTransfer();
      for (let i = 0; i < (count as number); i++) {
        transfer.items.add(new File([bytes], `holiday-${i + 1}.jpg`, { type: 'image/jpeg' }));
      }
      const input = document.querySelector('input[type=file]') as HTMLInputElement;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [PHOTO, COUNT] as const,
  );

  await expect(page.getByRole('button', { name: `Optimize ${COUNT} files` })).toBeVisible();

  const started = Date.now();
  await page.getByRole('button', { name: `Optimize ${COUNT} files` }).click();

  const savings = page.getByLabel('Savings');
  await expect(savings).toBeVisible({ timeout: 540_000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`twenty photos took ${seconds}s`);

  // Every one of them finished, and none was skipped.
  await expect(savings).toContainText('% smaller');
  await expect(page.getByText(/left\s+unchanged/)).toBeHidden();

  const rows = page.locator('tbody tr').filter({ hasText: 'holiday-' });
  await expect(rows).toHaveCount(COUNT);
  // Each row reports a real result rather than a stalled progress label.
  await expect(page.getByText('% smaller').first()).toBeVisible();
  expect(await page.getByText(/\d+% smaller/).count()).toBeGreaterThanOrEqual(COUNT);

  // And the whole batch is still downloadable.
  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);
  expect((await downloaded.path()).length).toBeGreaterThan(0);
});

/**
 * The same question for whole-site mode, which until now had only ever seen a
 * 12-file fixture. 40 pages is 120 before-and-after renders, which is where the
 * verifier spends its time; this is the test that would notice it hanging,
 * leaking iframes, or reporting a clean site as broken at volume.
 */
test('a forty-page site', async ({ page }) => {
  test.setTimeout(600_000);
  const png = readFileSync('tests/fixtures/flat.png').toString('base64');
  await page.goto('/');
  // React renders after the load event; the input may not exist the moment goto returns.
  await page.locator('input[type=file]').waitFor({ state: 'attached' });

  await page.evaluate((base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const transfer = new DataTransfer();
    const add = (path: string, body: BlobPart) => {
      const file = new File([body], path.split('/').pop()!);
      Object.defineProperty(file, 'webkitRelativePath', { value: path });
      transfer.items.add(file);
    };

    add('css/site.css', 'body{margin:0;font:16px/1.5 sans-serif} .grid img{width:30%;margin:1%}');
    for (let i = 0; i < 60; i++) add(`img/photo-${i}.png`, bytes);
    for (let p = 0; p < 40; p++) {
      const imgs = [0, 1, 2]
        .map((k) => `<img src="../img/photo-${(p + k * 20) % 60}.png" alt="">`)
        .join('');
      add(
        `pages/page-${p}.html`,
        `<!doctype html><html><head><link rel="stylesheet" href="../css/site.css"></head>` +
          `<body><h1>Page ${p}</h1><div class="grid">${imgs}</div><a href="page-${(p + 1) % 40}.html">next</a></body></html>`,
      );
    }
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, png);

  await expect(page.getByRole('radio', { name: /whole site \(40 pages\)/ })).toBeChecked();
  const started = Date.now();
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();

  const verification = page.getByRole('region', { name: 'Verification' });
  await expect(verification).toBeVisible({ timeout: 540_000 });
  console.log(`forty pages took ${Math.round((Date.now() - started) / 1000)}s`);

  await expect(verification).toContainText('Checked. 40 pages');
  await expect(page.getByRole('button', { name: 'Download site' })).toBeVisible();
});
