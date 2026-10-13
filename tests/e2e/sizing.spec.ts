import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';

/**
 * ADR-029 (zip input), ADR-030 (right-sizing images in whole-site mode),
 * one-size output in files mode, and ADR-031 (the unused-CSS report).
 */

type Entry = { path: string; text?: string; bytes?: Uint8Array };

async function drop(page: Page, entries: Entry[]) {
  await page.goto('/');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  const list = entries.map((e) => ({
    path: e.path,
    text: e.text,
    base64: e.bytes ? Buffer.from(e.bytes).toString('base64') : undefined,
  }));
  await page.evaluate((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      let body: BlobPart = item.text ?? '';
      if (item.base64) {
        const binary = atob(item.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        body = bytes;
      }
      const file = new File([body], item.path.split('/').pop()!);
      Object.defineProperty(file, 'webkitRelativePath', { value: item.path });
      transfer.items.add(file);
    }
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, list);
}

const PHOTO = new Uint8Array(readFileSync('tests/fixtures/photo.jpg')); // 1200x800

/* ------------------------------------------------------------------ */

test('a WordPress theme dropped as a .zip is opened and treated as a site', async ({ page }) => {
  const theme = zipSync({
    'mytheme/style.css': strToU8('/*\nTheme Name: Zipped\n*/\nbody { margin: 0; }\n'),
    'mytheme/index.php': strToU8('<?php get_header(); ?>'),
    'mytheme/img/logo.png': new Uint8Array(readFileSync('tests/fixtures/flat.png')),
    '__MACOSX/mytheme/._style.css': strToU8('junk'),
  });
  await drop(page, [{ path: 'mytheme.zip', bytes: theme }]);

  await expect(page.getByText('Opened mytheme.zip: 3 files.')).toBeVisible();
  await expect(page.getByRole('radio', { name: /whole site \(1 template\)/ })).toBeChecked();
  await expect(page.getByText('3 dropped')).toBeVisible();
});

test('a whole site scales an image down to the size it is shown at', async ({ page }) => {
  await drop(page, [
    {
      path: 'index.html',
      text: '<!doctype html><html><head><link rel="stylesheet" href="s.css"></head><body><img class="thumb" src="img/photo.jpg" alt=""><img class="bg-source" src="img/hero.jpg" alt=""></body></html>',
    },
    // .thumb is 300px wide everywhere: at most 300 x 3 (phones) = 900px is needed.
    // hero.jpg is also a CSS background, which could be shown at any size.
    { path: 's.css', text: '.thumb{width:300px;height:auto}.bg-source{width:200px}body{background:url(img/hero.jpg)}' },
    { path: 'img/photo.jpg', bytes: PHOTO },
    { path: 'img/hero.jpg', bytes: PHOTO },
  ]);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();

  const verification = page.getByRole('region', { name: 'Verification' });
  await expect(verification).toContainText('Checked.', { timeout: 120_000 });
  await expect(page.getByRole('region', { name: 'Site savings' })).toContainText('1 image scaled down');

  const files = page.locator('details').filter({ hasText: 'Every file' });
  await files.locator('summary').click();
  await expect(files).toContainText('scaled from 1200 to 900px wide');
  // The one a stylesheet also uses keeps its full size.
  await expect(files.locator('tr', { hasText: 'img/hero' })).not.toContainText('scaled');

  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download site' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await downloaded.path())));
  const name = Object.keys(zip).find((n) => n.startsWith('img/photo'))!;
  const width = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    return bitmap.width;
  }, Buffer.from(zip[name]!).toString('base64'));
  expect(width).toBe(900);
});

test('one size, cropped to fill, in a single format', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('radio', { name: 'One size' }).check();
  await page.getByRole('spinbutton', { name: 'Width' }).fill('300');
  await page.getByRole('spinbutton', { name: 'Height' }).fill('300');
  await page.getByRole('spinbutton', { name: 'Height' }).blur();
  await page.getByRole('radio', { name: 'Crop to fill' }).check();
  await page.getByRole('checkbox', { name: 'AVIF', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Original format', exact: true }).uncheck();

  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();

  const snippet = page.locator('pre');
  await expect(snippet).toContainText('<img src="photo-300.webp"');
  await expect(snippet).toContainText('width="300" height="300"');
  await expect(snippet).not.toContainText('<picture>');
});

test('the unused-CSS report lists what matched nothing, and changes nothing', async ({ page }) => {
  const css = '.used{color:red}.ghost{color:blue}a:hover{color:green}.card .missing-child{margin:0}';
  await drop(page, [
    { path: 'index.html', text: '<!doctype html><html><head><link rel="stylesheet" href="site.css"></head><body><p class="used">x</p><a href="#">y</a><div class="card"></div></body></html>' },
    { path: 'site.css', text: css },
  ]);
  await page.getByRole('checkbox', { name: /content fingerprint/ }).uncheck();
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('region', { name: 'Verification' })).toContainText('Checked.', { timeout: 120_000 });

  const report = page.getByRole('region', { name: 'Possibly unused CSS' });
  await report.getByRole('button', { name: 'Find possibly unused CSS' }).click();
  await expect(report).toContainText('2 rules matched nothing');
  await report.locator('summary').click();
  await expect(report).toContainText('.ghost');
  await expect(report).toContainText('.card .missing-child');
  await expect(report).not.toContainText('.used');
  await expect(report).not.toContainText('a:hover');

  // The download still has every rule - the report never edits anything.
  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download site' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await downloaded.path())));
  const out = new TextDecoder().decode(zip['site.css']!);
  expect(out).toContain('.ghost');
  expect(out).toContain('.missing-child');
});

test('a whole-site run finishes in a background tab', async ({ page }) => {
  // A background tab gets no animation frames at all. An earlier build waited
  // on one between screen widths and hung forever if the user switched tabs -
  // found on the live site, not by a test. Simulated here by never running them.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await drop(page, [
    { path: 'index.html', text: '<!doctype html><html><head><link rel="stylesheet" href="s.css"></head><body><img class="t" src="img/photo.jpg" alt=""></body></html>' },
    { path: 's.css', text: '.t{width:300px;height:auto}' },
    { path: 'img/photo.jpg', bytes: PHOTO },
  ]);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('region', { name: 'Verification' })).toContainText('Checked.', { timeout: 120_000 });
  await expect(page.getByRole('region', { name: 'Site savings' })).toContainText('1 image scaled down');
});
