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
