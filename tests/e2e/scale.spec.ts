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
