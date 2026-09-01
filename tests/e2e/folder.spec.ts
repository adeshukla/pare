import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Folder mode and the verifier that gates it.
 *
 * The unit suite proves Law 3 decides correctly. What can only be shown here is
 * that the pages Pare produces actually render, and that the verifier notices
 * when they do not - so the last two tests deliberately break a site and check
 * that the download is withheld.
 */

const FIXTURES = 'tests/fixtures/site';

const SITE = [
  'index.html',
  'about.html',
  'css/site.css',
  'css/type.css',
  'js/app.js',
  'img/hero.png',
  'img/icon.png',
  'img/inline.png',
  'img/scripted.png',
  'img/site.woff2',
];

/**
 * Hand the page a folder, not a flat list of files.
 *
 * `setInputFiles` produces File objects with no `webkitRelativePath`, so ingest
 * falls back to the bare filename and `css/site.css` arrives as `site.css`. The
 * whole point of folder mode is nested paths and relative addresses, so the drop
 * is built in the page with the relative paths a real folder pick would carry.
 */
async function dropSite(page: import('@playwright/test').Page) {
  await page.goto('/');

  const files = SITE.map((name) => ({
    path: name,
    base64: readFileSync(`${FIXTURES}/${name}`).toString('base64'),
  }));

  await page.evaluate((entries) => {
    const transfer = new DataTransfer();
    for (const entry of entries) {
      const binary = atob(entry.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const file = new File([bytes], entry.path.split('/').pop()!);
      // Exactly what a directory pick sets, and what ingest reads.
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.path });
      transfer.items.add(file);
    }

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);

  await expect(page.getByRole('button', { name: /^Optimize the site$/ })).toBeVisible();
}

test('a folder of pages switches to whole-site mode automatically', async ({ page }) => {
  await dropSite(page);
  await expect(page.getByRole('region', { name: 'Whole site' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Optimize the whole site/ })).toBeChecked();
});

test('optimizes the site, verifies it, and only then offers the download', async ({ page }) => {
  await dropSite(page);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();

  const verification = page.getByRole('region', { name: 'Verification' });
  await expect(verification).toBeVisible({ timeout: 90_000 });

  // Nothing may move. Folder mode changes bytes and addresses, never layout.
  await expect(verification).toContainText('Checked.');
  await expect(verification).toContainText('every element is in the same place');

  await expect(page.getByRole('region', { name: 'Site savings' })).toContainText('% smaller');
  await expect(page.getByRole('button', { name: 'Download site' })).toBeVisible();
});

test('the zip is a complete site with fingerprinted names and updated addresses', async ({
  page,
}) => {
  await dropSite(page);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('button', { name: 'Download site' })).toBeVisible({
    timeout: 90_000,
  });

  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download site' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await downloaded.path())));
  const names = Object.keys(zip);

  // Every input file comes out, exactly once.
  expect(names).toHaveLength(SITE.length);

  // Pages keep their names: a page's name is its address.
  expect(names).toContain('index.html');
  expect(names).toContain('about.html');

  // Law 3 pinned these two, so they must still be at their original names.
  expect(names).toContain('img/inline.png');
  expect(names).toContain('img/scripted.png');

  // icon.png had only resolvable references, so it is fingerprinted.
  const icon = names.find((n) => /^img\/icon\.[0-9a-f]{8}\.png$/.test(n));
  expect(icon, 'icon.png should have been fingerprinted').toBeDefined();

  const html = strFromU8(zip['index.html']!);
  // The address was updated to match the new filename...
  expect(html).toContain(icon!.split('/').pop());
  // ...and the two pinned ones were left exactly as they were.
  expect(html).toContain("url('img/inline.png')");
  expect(html).toContain('{{ asset_path }}/img/hero.png');
  expect(html).toContain('https://example.com/remote.png');

  // site.css is itself fingerprinted, so find it by shape rather than by name.
  const cssName = names.find((n) => /^css\/site\.[0-9a-f]{8}\.css$/.test(n));
  expect(cssName, 'site.css should have been fingerprinted').toBeDefined();
  const css = strFromU8(zip[cssName!]!);
  // The relative shape of a stylesheet reference survives.
  expect(css).toMatch(/\.\.\/img\/hero\.[0-9a-f]{8}\.png/);
  // A stylesheet pointing at a file we never received is untouched.
  expect(css).toContain('../img/absent.png');
});

test('every file in the site got smaller or stayed the same', async ({ page }) => {
  await dropSite(page);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('button', { name: 'Download site' })).toBeVisible({
    timeout: 90_000,
  });

  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download site' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await downloaded.path())));

  const originalSize = (name: string) => readFileSync(`${FIXTURES}/${name}`).byteLength;
  const total = { before: 0, after: 0 };

  for (const [name, out] of Object.entries(zip)) {
    // Map a fingerprinted name back to the file it came from.
    const source = SITE.find((s) => {
      const stem = s.replace(/\.([a-z0-9]+)$/, '');
      return name === s || new RegExp(`^${stem}\\.[0-9a-f]{8}\\.`).test(name);
    });
    expect(source, `${name} should map back to an input`).toBeDefined();
    total.before += originalSize(source!);
    total.after += out.byteLength;
    // Law 5: never hand back something bigger than what was given.
    expect(out.byteLength, `${name} grew`).toBeLessThanOrEqual(originalSize(source!));
  }

  expect(total.after).toBeLessThan(total.before);
});

test('the warning list names every file it left alone, and why', async ({ page }) => {
  await dropSite(page);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('button', { name: 'Download site' })).toBeVisible({
    timeout: 90_000,
  });

  const warnings = page.locator('details');
  await warnings.locator('summary').click();

  await expect(warnings).toContainText('img/inline.png');
  await expect(warnings).toContainText('inline style attribute');
  await expect(warnings).toContainText('img/scripted.png');
  await expect(warnings).toContainText('scripts are not rewritten');
});

test('turning off fingerprinting leaves every filename alone', async ({ page }) => {
  await dropSite(page);
  await page
    .getByRole('checkbox', { name: /content fingerprint/ })
    .uncheck();
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('button', { name: 'Download site' })).toBeVisible({
    timeout: 90_000,
  });

  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download site' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await downloaded.path())));

  expect(Object.keys(zip).sort()).toEqual([...SITE].sort());
  // Files still shrank; only the names were left alone.
  expect(zip['css/site.css']!.byteLength).toBeLessThan(
    readFileSync(`${FIXTURES}/css/site.css`).byteLength,
  );
});

/* ------------------------------------------------------------------ *
 * The gate itself
 * ------------------------------------------------------------------ */

test('the verifier catches a page whose stylesheet stopped loading', async ({ page }) => {
  await page.goto('/');

  // Render a site twice: once intact, once with the stylesheet address broken.
  // This is the failure folder mode could cause if Law 3 were got wrong, so the
  // verifier has to see it.
  const result = await page.evaluate(async (modulePath) => {
    const { verify } = (await import(/* @vite-ignore */ modulePath)) as {
      verify: (
        before: unknown[],
        after: unknown[],
        pages: string[],
      ) => Promise<{ passed: boolean; findings: Array<{ message: string }> }>;
    };

    const enc = new TextEncoder();
    const file = (path: string, text: string, mime: string, kind: string) => ({
      path,
      bytes: enc.encode(text),
      mime,
      kind,
    });

    const css = '.box{width:200px;height:120px;background:#1c6b4a}';
    const good = [
      file(
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body><div class="box"></div></body></html>',
        'text/html',
        'html',
      ),
      file('a.css', css, 'text/css', 'css'),
    ];
    const broken = [
      file(
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="gone.css"></head><body><div class="box"></div></body></html>',
        'text/html',
        'html',
      ),
      file('a.css', css, 'text/css', 'css'),
    ];

    return verify(good, broken, ['index.html']);
  }, '/src/lib/verify.ts');

  expect(result.passed).toBe(false);
  expect(result.findings.length).toBeGreaterThan(0);
  expect(result.findings.map((f) => f.message).join(' ')).toMatch(/changed position or size/);
});

test('the verifier passes a site whose addresses changed but layout did not', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async (modulePath) => {
    const { verify } = (await import(/* @vite-ignore */ modulePath)) as {
      verify: (b: unknown[], a: unknown[], p: string[]) => Promise<{ passed: boolean }>;
    };

    const enc = new TextEncoder();
    const file = (path: string, text: string, mime: string, kind: string) => ({
      path,
      bytes: enc.encode(text),
      mime,
      kind,
    });
    const css = '.box{width:200px;height:120px;background:#1c6b4a}';

    // Exactly what folder mode does: same bytes, different filename.
    const before = [
      file(
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body><div class="box"></div></body></html>',
        'text/html',
        'html',
      ),
      file('a.css', css, 'text/css', 'css'),
    ];
    const after = [
      file(
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="a.deadbeef.css"></head><body><div class="box"></div></body></html>',
        'text/html',
        'html',
      ),
      file('a.deadbeef.css', css, 'text/css', 'css'),
    ];

    return verify(before, after, ['index.html']);
  }, '/src/lib/verify.ts');

  expect(result.passed).toBe(true);
});

test('the verifier catches a background image that stopped painting', async ({ page }) => {
  await page.goto('/');

  // This is the bug an earlier build actually shipped: the HTML minifier emptied
  // every inline style attribute. Nothing moved, because a background image
  // takes up no space, and a geometry-only diff called the site clean.
  const result = await page.evaluate(async (modulePath) => {
    const { verify } = (await import(/* @vite-ignore */ modulePath)) as {
      verify: (
        b: unknown[],
        a: unknown[],
        p: string[],
      ) => Promise<{ passed: boolean; findings: Array<{ message: string }> }>;
    };

    const enc = new TextEncoder();
    const file = (path: string, text: string, mime: string, kind: string) => ({
      path,
      bytes: enc.encode(text),
      mime,
      kind,
    });

    const page = (style: string) =>
      file(
        'index.html',
        `<!doctype html><html><body><div style="${style}width:100px;height:100px"></div></body></html>`,
        'text/html',
        'html',
      );

    return verify(
      [page('background-image:linear-gradient(#000,#fff);')],
      [page('')],
      ['index.html'],
    );
  }, '/src/lib/verify.ts');

  expect(result.passed).toBe(false);
  expect(result.findings.map((f) => f.message).join(' ')).toMatch(/background image/i);
});
