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

/**
 * ADR-040: the Content-Security-Policy in public/_headers, which the preview
 * sends exactly, refuses nothing Pare itself does - every codec, the checker's
 * page copies and the offline worker. A refused codec would show up twice: as
 * a console report, and as files that come back skipped.
 */
/**
 * The one codec whose worker needs the /assets/ policy's 'unsafe-eval' (the
 * WOFF2 glue), with the minifiers, on its own - so every engine shows that a
 * worker runs under its own script's policy, not the page's.
 */
test('fonts and code run under the security policy', async ({ page }) => {
  test.setTimeout(200_000);
  const refused: string[] = [];
  page.on('console', (m) => {
    if (/Content.Security.Policy|Refused to/i.test(m.text())) refused.push(m.text());
  });
  page.on('pageerror', (e) => refused.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles([
    'tests/fixtures/fonts/plex-mono.woff2',
    'tests/fixtures/text/site.css',
    'tests/fixtures/text/app.js',
    'tests/fixtures/text/logo.svg',
  ]);
  await page.getByRole('button', { name: 'Optimize 4 files' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/could not|Could not/)).toHaveCount(0);
  expect(refused).toEqual([]);
});

test('the security policy refuses nothing Pare does', async ({ page, browserName }) => {
  // Ten mixed files at once stall in WebKit on the build machine at "Decoding",
  // with this policy and without it alike - a WebKit load problem, not the
  // policy, which the tests above cover there. Open in STATUS.md.
  test.fixme(browserName === 'webkit', 'ten files at once stall in WebKit, with or without the policy');
  test.setTimeout(300_000);
  const refused: string[] = [];
  page.on('console', (m) => {
    const text = m.text();
    // The test site names an image on another origin. The checker's copies of
    // a page never load those - cross-origin isolation blocked them before this
    // policy existed, on both sides of the comparison alike.
    if (/example.com/.test(text)) return;
    if (/Content.Security.Policy|Refused to/i.test(text)) refused.push(text);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content-Security-Policy refused ${e.violatedDirective}: ${e.blockedURI}`);
    });
  });

  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'system')).toBeTruthy();

  // Files: every image codec (AVIF, WebP, JPEG, PNG, HEIC, TIFF, animation), a
  // font, and each minifier.
  await page.locator('input[type=file]').setInputFiles([
    'tests/fixtures/photo.jpg',
    'tests/fixtures/flat.png',
    'tests/fixtures/photo.heic',
    'tests/fixtures/gradient.tif',
    'tests/fixtures/animated.gif',
    'tests/fixtures/fonts/plex-mono.woff2',
    'tests/fixtures/text/site.css',
    'tests/fixtures/text/app.js',
    'tests/fixtures/text/page.html',
    'tests/fixtures/text/logo.svg',
  ]);
  // An .html file makes the drop look like a site; these are separate files.
  await page.getByRole('radio', { name: /Just give me optimized files/ }).check();
  await page.getByRole('button', { name: 'Optimize 10 files' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText(/could not|Could not/)).toHaveCount(0);

  // A whole site, rendered before and after by the checker in framed copies.
  const site = 'tests/fixtures/site';
  const { readdirSync, statSync, readFileSync } = await import('node:fs');
  const entries: Array<{ path: string; b64: string }> = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      const path = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, path);
      else entries.push({ path: `site/${path}`, b64: readFileSync(full).toString('base64') });
    }
  };
  walk(site, '');
  await page.evaluate((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      const bytes = Uint8Array.from(atob(item.b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], item.path.split('/').pop()!);
      Object.defineProperty(file, 'webkitRelativePath', { value: item.path });
      transfer.items.add(file);
    }
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, entries);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('region', { name: 'Verification' })).toBeVisible({ timeout: 200_000 });

  expect(refused).toEqual([]);
});
