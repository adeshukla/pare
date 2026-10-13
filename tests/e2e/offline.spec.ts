import { expect, test } from '@playwright/test';

/**
 * ADR-023: after one visit, Pare works with the network gone - Law 1's own test,
 * "works with the network cable unplugged after first load", made literal.
 */
test('optimizes a photo after reloading with the network off', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 30_000 });

  // Use the encoders once while online, which is what puts them in the cache.
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toContainText('% smaller');
});

/**
 * ADR-036: a file shared from another app (Android's share sheet POSTs it to
 * /share-target) is kept by the service worker and opened like a drop.
 */
test('a file shared to Pare from another app is opened like a drop', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 30_000 });

  // What the system does on a share: a multipart POST to the manifest's action.
  const landed = await page.evaluate(async () => {
    const form = new FormData();
    form.append('files', await (await fetch('/icon-192.png')).blob(), 'shared-photo.png');
    const response = await fetch('/share-target', { method: 'POST', body: form });
    return new URL(response.url).pathname + new URL(response.url).search;
  });
  expect(landed).toBe('/?shared=1');

  await page.goto(landed);
  await expect(page.getByRole('button', { name: 'Optimize 1 file' })).toBeVisible();
  await expect(page.getByText('shared-photo.png')).toBeVisible();
  // Taken once: the address is tidied and the cache emptied.
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => caches.has('shared-files'))).toBe(false);
});
