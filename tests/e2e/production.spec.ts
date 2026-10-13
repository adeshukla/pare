import { expect, test } from '@playwright/test';
/**
 * The built site, with production's isolation headers, in every engine. The
 * rest of the suite runs on the dev server, which does not send those headers
 * (see vite.config.ts) - so this is where Safari and Firefox meet the threaded
 * AVIF encoder exactly as users do.
 */
test('the production build optimizes a photo', async ({ page, browserName }) => {
  test.setTimeout(200_000);

  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  const t = Date.now();
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 150_000 });
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByLabel('Savings')).toContainText('% smaller');
  console.log(browserName, 'production photo took', Math.round((Date.now() - t) / 1000), 's');
});
