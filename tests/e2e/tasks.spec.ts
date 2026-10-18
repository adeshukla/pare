import { expect, test } from '@playwright/test';

/**
 * ADR-034 (under a size), ADR-035 (task pages), ADR-036 (Save and Share on a
 * phone). The share target itself needs the service worker, so it is tested
 * against the production build in offline.spec.ts.
 */

test('fits a photo under 20 KB and saves that one file', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg'); // 176 KB
  await page.getByRole('radio', { name: 'Under a size' }).check();
  await page.getByRole('button', { name: '20 KB', exact: true }).click();
  await expect(page.getByRole('button', { name: '20 KB', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: 'AVIF', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'WebP', exact: true }).uncheck();

  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/fit under 20 KB/i)).toBeVisible();

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Save photo/ }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^photo-\d+\.jpg$/);
  const path = await file.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path).size).toBeLessThanOrEqual(20 * 1024);
});

test('an opaque PNG over the limit comes out as a JPEG, and says so', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/flat.png'); // 4.9 KB, opaque
  await page.getByRole('radio', { name: 'Under a size' }).check();
  const custom = page.getByRole('spinbutton', { name: 'Or any size, in KB' });
  await custom.fill('2');
  await custom.blur();
  await page.getByRole('checkbox', { name: 'AVIF', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'WebP', exact: true }).uncheck();

  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Saved as JPEG/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save flat-\d+\.jpg$/ })).toBeVisible();
});

test('a task page has its own words and starts from its own settings', async ({ page }) => {
  await page.goto('/tools/heic-to-jpg/');
  await expect(page).toHaveTitle(/HEIC to JPG/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('HEIC to JPG.');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://pare.devstash.me/tools/heic-to-jpg/');

  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('radio', { name: 'One size' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'AVIF', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'WebP', exact: true })).not.toBeChecked();

  // Its choices are its own: the main page still starts from the defaults.
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('radio', { name: 'Responsive set' })).toBeChecked();

  // And every task page links to the others.
  await expect(page.getByRole('navigation', { name: 'Tools' }).getByRole('link')).toHaveCount(6);
});

test('a page in another language, and the picker moves between them (ADR-041)', async ({ page }) => {
  await page.goto('/hi/tools/compress-image/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('साइज़ में लाएँ, 100 KB से कम।');
  await expect(page.getByRole('button', { name: 'फ़ाइलें चुनें' })).toBeVisible();
  await expect(page.locator('link[rel=alternate][hreflang=es]')).toHaveAttribute(
    'href',
    'https://pare.devstash.me/es/tools/compress-image/',
  );

  // The same task's settings apply in every language.
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('radio', { name: 'तय साइज़ से कम' })).toBeChecked();
  await expect(page.getByRole('button', { name: '1 फ़ाइल छोटी करें' })).toBeVisible();

  await page.getByRole('combobox', { name: 'भाषा' }).selectOption('es');
  await expect(page).toHaveURL(/\/es\/tools\/compress-image\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Que quepa, menos de 100 KB.');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page).toHaveURL(/\/tools\/compress-image\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it fit under 100 KB.');
});

test('a form photo: exactly 200×230 and under 50 KB, from one tap', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/tools/compress-image/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg'); // 1200×800
  await page.getByRole('button', { name: /^Form photo/ }).click();
  await expect(page.getByRole('button', { name: /^Form photo/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('200');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('230');

  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Cropped to 200×230 from the middle of the 1200×800 picture.')).toBeVisible();

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Save photo/ }).click(),
  ]);
  const { readFileSync } = await import('node:fs');
  const bytes = readFileSync(await file.path());
  expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
  const size = await page.evaluate(async (b64) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
    return [bitmap.width, bitmap.height];
  }, bytes.toString('base64'));
  expect(size).toEqual([200, 230]);
});

test('notes about a file read in the page language', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/hi/tools/compress-image/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('button', { name: /^फ़ॉर्म फ़ोटो/ }).click();
  await page.getByRole('button', { name: '1 फ़ाइल छोटी करें' }).click();
  await expect(page.getByLabel('बचत')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('1200×800 तस्वीर के बीच से 200×230 काटा गया।')).toBeVisible();
  await expect(page.getByText(/^Cropped to/)).toHaveCount(0);
});
