import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * The small things that decide whether a stranger gets through the page:
 * dropping anywhere, pasting a screenshot, settings that survive a reload, a
 * way to start again, and seeing what the encoder did to a photo.
 */

const PHOTO = readFileSync('tests/fixtures/photo.jpg').toString('base64');

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
}

/** Fire `event` on window carrying photo.jpg, the way a drop or paste does. */
async function deliver(page: Page, event: 'drop' | 'paste') {
  return page.evaluate(
    ([base64, kind]) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'photo.jpg', { type: 'image/jpeg' }));
      try {
        const e =
          kind === 'drop'
            ? new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
            : new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
        // An engine that ignores the init dictionary cannot be tested this way.
        // Firefox hands an untrusted paste an empty clipboard; a real one works.
        const carried = kind === 'drop' ? (e as DragEvent).dataTransfer : (e as ClipboardEvent).clipboardData;
        if (!carried || carried.files.length === 0) return false;
        document.body.dispatchEvent(e);
        return true;
      } catch {
        return false;
      }
    },
    [PHOTO, event] as const,
  );
}

test('a drop anywhere on the page is taken, not just on the box', async ({ page }) => {
  await open(page);
  test.skip(!(await deliver(page, 'drop')), 'this engine cannot synthesise a drop');
  await expect(page.getByRole('button', { name: 'Optimize 1 file' })).toBeVisible();
});

test('a pasted image is taken, unless the paste goes into a text field', async ({ page, browserName }) => {
  // Firefox and WebKit hand a synthetic paste an empty clipboard by design; only
  // Chromium lets a test build one. A real paste works in all three.
  test.skip(browserName !== 'chromium', 'synthetic paste events carry no files here');
  await open(page);
  test.skip(!(await deliver(page, 'paste')), 'this engine cannot synthesise a paste');
  await expect(page.getByRole('button', { name: 'Optimize 1 file' })).toBeVisible();
});

test('settings survive a reload', async ({ page }) => {
  await open(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('checkbox', { name: 'WebP', exact: true }).uncheck();

  await page.reload();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('checkbox', { name: 'WebP', exact: true })).not.toBeChecked();
});

test('start over clears the list and brings the full drop area back', async ({ page }) => {
  await open(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('button', { name: /^Optimize/ })).toBeHidden();
  await expect(page.getByText('Drop a folder or files here')).toBeVisible();
});

test('an optimized photo can be compared with its original', async ({ page }) => {
  await open(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();
  await page.getByRole('button', { name: 'photo.jpg' }).click();

  // WebP: every engine under test displays it. Playwright's WebKit on Windows
  // cannot display AVIF, which the page says rather than showing a blank.
  await page.getByRole('radio', { name: 'WebP' }).check();
  const original = page.getByRole('img', { name: 'Original' });
  const encoded = page.getByRole('img', { name: /Encoded as/ });
  await expect(original).toBeVisible();
  // Both actually decoded - a revoked blob URL renders as a blank 0px image.
  await expect
    .poll(() => encoded.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1200);
  await expect
    .poll(() => original.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1200);

  await page.getByRole('slider', { name: /Slide to compare/ }).fill('20');
  await expect(encoded).toHaveAttribute('style', /inset\(0px 0px 0px 20%\)/);
});
