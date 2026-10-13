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
