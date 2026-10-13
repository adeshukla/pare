import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

/**
 * ADR-021: whole-site mode may wrap a plain <img> in a <picture> offering AVIF
 * and WebP. The unit suite covers which images and pages qualify; this proves
 * the result renders, that the verifier sees a wrapper change anything, and
 * that the report counts what a visitor actually downloads.
 */

const PHOTO = readFileSync('tests/fixtures/photo.jpg').toString('base64');

type Entry = { path: string; text?: string; photo?: boolean };

/** A dropped folder, built in the page with the paths a directory pick carries. */
async function dropSite(page: Page, entries: Entry[]) {
  await page.goto('/');
  // React renders after the load event; the input may not exist the moment goto returns.
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await page.evaluate(
    ([list, photo]) => {
      const binary = atob(photo as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const transfer = new DataTransfer();
      for (const entry of list as Entry[]) {
        const file = new File([entry.photo ? bytes : entry.text!], entry.path.split('/').pop()!);
        Object.defineProperty(file, 'webkitRelativePath', { value: entry.path });
        transfer.items.add(file);
      }
      const input = document.querySelector('input[type=file]') as HTMLInputElement;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [entries, PHOTO] as const,
  );
  await expect(page.getByRole('button', { name: /^Optimize the site$/ })).toBeVisible();
}

const page = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="css/s.css"></head><body>${body}</body></html>`;

async function runWithModernFormats(p: Page) {
  await p.getByRole('checkbox', { name: /AVIF and WebP/ }).check();
  await p.getByRole('button', { name: /^Optimize the site$/ }).click();
  const verification = p.getByRole('region', { name: 'Verification' });
  await expect(verification).toBeVisible({ timeout: 120_000 });
  return verification;
}

async function downloadZip(p: Page) {
  const [downloaded] = await Promise.all([
    p.waitForEvent('download'),
    p.getByRole('button', { name: 'Download site' }).click(),
  ]);
  return unzipSync(new Uint8Array(readFileSync(await downloaded.path())));
}

test('wraps plain images, emits the copies, and passes the check', async ({ page: p }) => {
  await dropSite(p, [
    { path: 'index.html', text: page('<h1>Hi</h1><img src="img/photo.jpg" alt="A" width="600" height="400"><p>x</p>') },
    { path: 'css/s.css', text: 'img{max-width:100%;height:auto} .card img{border-radius:4px}' },
    { path: 'img/photo.jpg', photo: true },
  ]);

  const verification = await runWithModernFormats(p);
  await expect(verification).toContainText('Checked.');
  await expect(p.getByRole('region', { name: 'Site savings' })).toContainText(
    '1 image now offer AVIF or WebP',
  );

  const zip = await downloadZip(p);
  const names = Object.keys(zip);
  const avif = names.find((n) => /^img\/photo\.[0-9a-f]{8}\.avif$/.test(n));
  const webp = names.find((n) => /^img\/photo\.[0-9a-f]{8}\.webp$/.test(n));
  expect(avif, 'an AVIF copy, fingerprinted like its original').toBeDefined();
  expect(webp).toBeDefined();

  const html = strFromU8(zip['index.html']!);
  expect(html).toContain(`<picture><source type="image/avif" srcset="${avif}">`);
  expect(html).toContain(`<source type="image/webp" srcset="${webp}">`);
  // The <img> itself keeps every attribute it had, and closes the picture.
  expect(html).toMatch(/<img src="?img\/photo\.[0-9a-f]{8}\.jpg"? alt="?A"? width="?600"? height="?400"?\s*\/?><\/picture>/);
});

test('refuses the whole site when CSS picks images by position', async ({ page: p }) => {
  await dropSite(p, [
    { path: 'index.html', text: page('<div class="gallery"><img src="img/photo.jpg" alt="A"></div>') },
    { path: 'css/s.css', text: '.gallery > img{width:50%}' },
    { path: 'img/photo.jpg', photo: true },
  ]);

  await expect(await runWithModernFormats(p)).toContainText('Checked.');

  const warnings = p.locator('details').filter({ hasText: 'Left alone' });
  await warnings.locator('summary').click();
  await expect(warnings).toContainText('.gallery > img');

  const zip = await downloadZip(p);
  expect(Object.keys(zip).some((n) => n.endsWith('.avif') || n.endsWith('.webp'))).toBe(false);
  expect(strFromU8(zip['index.html']!)).not.toContain('<picture>');
});

test('the verifier catches a wrapper the static check could not see', async ({ page: p }) => {
  // `.row > *` names no img, so it passes the selector check - but after
  // wrapping it matches the <picture> instead, and the image loses its opacity.
  // Nothing moves. Only the computed-style comparison can see this.
  await dropSite(p, [
    { path: 'index.html', text: page('<div class="row"><img src="img/photo.jpg" alt="A" width="300" height="200"></div>') },
    { path: 'css/s.css', text: '.row > * { opacity: 0.5 }' },
    { path: 'img/photo.jpg', photo: true },
  ]);

  const verification = await runWithModernFormats(p);
  await expect(verification).toContainText('styled differently');
  await expect(p.getByRole('button', { name: 'Download site' })).toBeHidden();

  await p.getByRole('button', { name: 'Turn off AVIF and WebP and check again' }).click();
  await expect(p.getByRole('button', { name: 'Download site' })).toBeVisible({ timeout: 120_000 });
  await expect(p.getByRole('checkbox', { name: /AVIF and WebP/ })).not.toBeChecked();
});

test('the verifier notices an image that stopped loading', async ({ page: p }) => {
  await p.goto('/');
  // Before ADR-021 this check could never fire: it asked `instanceof
  // HTMLImageElement` of elements living in an iframe's realm, which is always
  // false. Geometry caught most broken images anyway, but not one with a fixed
  // width and height.
  const result = await p.evaluate(
    async ([modulePath, photo]) => {
      const { verify } = (await import(/* @vite-ignore */ modulePath as string)) as {
        verify: (
          b: unknown[],
          a: unknown[],
          p: string[],
        ) => Promise<{ passed: boolean; findings: Array<{ message: string }> }>;
      };
      const enc = new TextEncoder();
      const binary = atob(photo as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const html = (src: string) => ({
        path: 'index.html',
        bytes: enc.encode(`<!doctype html><img src="${src}" width="120" height="80">`),
        mime: 'text/html',
        kind: 'html',
      });
      const img = { path: 'a.jpg', bytes, mime: 'image/jpeg', kind: 'image' };
      return verify([html('a.jpg'), img], [html('gone.jpg'), img], ['index.html']);
    },
    ['/src/lib/verify.ts', PHOTO] as const,
  );

  expect(result.passed).toBe(false);
  expect(result.findings.map((f) => f.message).join(' ')).toMatch(/did not load|does not now/);
});

/* ------------------------------------------------------------------ *
 * Files mode polish
 * ------------------------------------------------------------------ */

test('each quality slider shows what it costs before anything runs', async ({ page: p }) => {
  await p.goto('/');
  await p.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  const images = p.getByRole('region', { name: 'Images' });
  await expect(images.getByText(/≈ [\d.]+ KB at 800px/)).toHaveCount(3, { timeout: 120_000 });

  const before = await images.getByText(/≈ .* at 800px/).first().textContent();
  await images.getByRole('slider', { name: 'AVIF quality' }).fill('90');
  await expect(images.getByText(/≈ .* at 800px/).first()).not.toHaveText(before!, {
    timeout: 120_000,
  });
});

test('an expanded snippet scrolls in its own box, not the page', async ({ page: p }) => {
  await p.goto('/');
  await p.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await p.getByRole('button', { name: /^Optimize 1 file$/ }).click();
  await expect(p.getByLabel('Savings')).toBeVisible();
  await p.getByRole('button', { name: 'photo.jpg' }).click();

  // A ThumbHash data URI is one very long line. It once stretched the results
  // table to 31,000px and put the Copy button off-screen.
  const copy = p.getByRole('button', { name: 'Copy', exact: true });
  await expect(copy).toBeVisible();
  // Below the comparison it may need a scroll down - never one sideways.
  const box = await copy.boundingBox();
  const { page, viewport } = await p.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(page).toBeLessThanOrEqual(viewport);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport);

  // Nothing in the expanded row may be wider than the card that holds it - the
  // card clips, so overflow there is content silently cut off, not a scrollbar.
  // Checked at "Actual size" too, where the picture is 1200px wide.
  for (const actual of [false, true]) {
    if (actual) await p.getByRole('checkbox', { name: 'Actual size' }).check();
    const overflow = await p.evaluate(() => {
      const td = document.querySelector('td[colspan] figure')!.closest('td')!;
      const card = td.closest('.card')!.getBoundingClientRect();
      const parts = [td.firstElementChild!, ...td.firstElementChild!.children];
      return parts.map((el) => Math.round(el.getBoundingClientRect().right - card.right)).filter((d) => d > 0);
    });
    expect(overflow, `parts wider than the card (actual size: ${actual})`).toEqual([]);
  }
});
