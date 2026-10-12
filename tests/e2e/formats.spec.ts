import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

/**
 * ADR-026 (HEIC, BMP), ADR-027 (WordPress and other server templates),
 * ADR-028 (minification levels, source maps, browser ranges), and the WOFF
 * fallback and quality presets.
 */

const b64 = (name: string) => readFileSync(`tests/fixtures/${name}`).toString('base64');

type Entry = { path: string; text?: string; fixture?: string };

/** A dropped folder, with the relative paths a directory pick carries. */
async function dropFolder(page: Page, entries: Entry[]) {
  await page.goto('/');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  const resolved = entries.map((e) => ({ path: e.path, text: e.text, base64: e.fixture ? b64(e.fixture) : undefined }));
  await page.evaluate((list) => {
    const transfer = new DataTransfer();
    for (const entry of list) {
      let body: BlobPart = entry.text ?? '';
      if (entry.base64) {
        const binary = atob(entry.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        body = bytes;
      }
      const file = new File([body], entry.path.split('/').pop()!);
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.path });
      transfer.items.add(file);
    }
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, resolved);
}

async function downloadSite(page: Page) {
  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download site' }).click(),
  ]);
  return unzipSync(new Uint8Array(readFileSync(await downloaded.path())));
}

/* ------------------------------------------------------------------ *
 * HEIC and BMP
 * ------------------------------------------------------------------ */

test('an iPhone HEIC and three kinds of BMP come out as web images', async ({ page }) => {
  // Firefox runs these WASM encoders about 7x slower than Chromium, and HEIC
  // adds a 1.9 MB decoder. Alone it takes ~2 minutes there; give it room.
  test.setTimeout(600_000);
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles(['photo.heic', 'gradient-24.bmp', 'palette-8.bmp', 'alpha-32.bmp'].map((n) => `tests/fixtures/${n}`));
  await page.getByRole('button', { name: 'Optimize 4 files' }).click();

  const savings = page.getByLabel('Savings');
  await expect(savings).toBeVisible({ timeout: 540_000 });
  await expect(page.getByText(/left\s+unchanged/)).toBeHidden();
  expect(await page.getByText(/\d+% smaller/).count()).toBeGreaterThanOrEqual(4);

  await page.getByRole('button', { name: 'photo.heic' }).click();
  const snippet = page.locator('pre');
  await expect(snippet).toContainText('type="image/avif"');
  // The universal fallback for a photograph is JPEG, never the HEIC itself.
  await expect(snippet).toContainText('photo-');
  await expect(snippet).toContainText('.jpg');
  await expect(snippet).not.toContainText('.heic"');
});

test('a whole site converts a BMP to PNG and updates the page', async ({ page }) => {
  await dropFolder(page, [
    { path: 'index.html', text: '<!doctype html><title>t</title><img src="img/pic.bmp" width="64" height="48" alt="">' },
    { path: 'img/pic.bmp', fixture: 'gradient-24.bmp' },
  ]);
  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  await expect(page.getByRole('region', { name: 'Verification' })).toContainText('Checked.', { timeout: 120_000 });

  const zip = await downloadSite(page);
  const png = Object.keys(zip).find((n) => /^img\/pic\.([0-9a-f]{8}\.)?png$/.test(n));
  expect(png, 'the BMP should now be a PNG').toBeDefined();
  expect(Object.keys(zip).some((n) => n.endsWith('.bmp'))).toBe(false);
  expect(strFromU8(zip['index.html']!)).toContain(png!.split('/').pop());
  expect(zip[png!]!.byteLength).toBeLessThan(readFileSync('tests/fixtures/gradient-24.bmp').byteLength);
});

/* ------------------------------------------------------------------ *
 * WordPress
 * ------------------------------------------------------------------ */

const THEME_CSS = `/*
Theme Name: Pare Test Theme
Author: Pare
Version: 1.0
*/

body {
  margin: 0;
  font-family: Georgia, serif;
  line-height: 1.5;
}

.hero {
  background-image: url(img/bg.bmp);
}
`;

test('a WordPress theme keeps every name, its header and its templates', async ({ page }) => {
  const header = `<?php wp_enqueue_script('theme', get_template_directory_uri() . '/js/theme.js'); ?>\n<img src="<?php echo get_template_directory_uri(); ?>/img/logo.png" alt="">`;
  await dropFolder(page, [
    { path: 'style.css', text: THEME_CSS },
    { path: 'header.php', text: header },
    { path: 'functions.php', text: '<?php // theme setup\n' },
    { path: 'js/theme.js', text: 'var siteName = "x";\nfunction greet(person) { var message = "Hello " + person; return message; }\n' },
    { path: 'img/logo.png', fixture: 'flat.png' },
    { path: 'img/bg.bmp', fixture: 'gradient-24.bmp' },
  ]);

  // A theme has no .html, and is still treated as a site.
  await expect(page.getByRole('radio', { name: /whole site \(2 templates\)/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /content fingerprint/ })).toBeDisabled();

  await page.getByRole('button', { name: /^Optimize the site$/ }).click();
  const verification = page.getByRole('region', { name: 'Verification' });
  await expect(verification).toContainText('no HTML pages', { timeout: 120_000 });

  const zip = await downloadSite(page);
  // Exactly the files that went in, under exactly their names.
  expect(Object.keys(zip).sort()).toEqual(
    ['style.css', 'header.php', 'functions.php', 'js/theme.js', 'img/logo.png', 'img/bg.bmp'].sort(),
  );
  // Templates are byte for byte untouched.
  expect(strFromU8(zip['header.php']!)).toBe(header);
  // The theme header WordPress reads survives minification.
  const css = strFromU8(zip['style.css']!);
  expect(css.startsWith('/*\nTheme Name: Pare Test Theme')).toBe(true);
  expect(css.length).toBeLessThan(THEME_CSS.length);
  // The global function another script could call keeps its name.
  expect(strFromU8(zip['js/theme.js']!)).toContain('greet');
});

/* ------------------------------------------------------------------ *
 * Minification levels, maps, browser ranges
 * ------------------------------------------------------------------ */

type TextApi = {
  minifyJs: (
    s: string,
    o?: { level?: string; preset?: string; sourceMap?: boolean; filename?: string },
  ) => Promise<{ code: string; map?: string; kept?: string }>;
};

async function textApi(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/workers/text-codecs.ts';
    (window as unknown as { __t: unknown }).__t = await import(/* @vite-ignore */ path);
  });
}

const SCRIPT = `var siteName = "Pare";
function greet(personName) {
  var greetingMessage = "Hello, " + personName;
  var fallback = personName ?? "friend";
  return greetingMessage + fallback;
}`;

test('safe renames nothing; balanced shortens locals but never a global', async ({ page }) => {
  await textApi(page);
  const out = await page.evaluate(async (src) => {
    const t = (window as unknown as { __t: TextApi }).__t;
    return {
      safe: (await t.minifyJs(src, { level: 'safe' })).code,
      balanced: (await t.minifyJs(src, { level: 'balanced' })).code,
    };
  }, SCRIPT);

  expect(out.safe).toContain('greetingMessage');
  expect(out.safe).toContain('personName');
  expect(out.balanced).not.toContain('greetingMessage');
  for (const code of [out.safe, out.balanced]) {
    expect(code).toContain('siteName');
    expect(code).toContain('greet');
  }
});

test('code that reads its own names is kept at safe, and says why', async ({ page }) => {
  await textApi(page);
  const out = await page.evaluate(async () => {
    const t = (window as unknown as { __t: TextApi }).__t;
    return t.minifyJs(
      'angular.module("app").controller("Ctrl", function($scope, $http) { var longLocalName = $scope; return longLocalName; });',
      { level: 'max' },
    );
  });
  expect(out.kept).toMatch(/AngularJS/);
  expect(out.code).toContain('$scope');
  expect(out.code).toContain('longLocalName');
});

test('a source map carries the original code, names and all', async ({ page }) => {
  await textApi(page);
  const map = await page.evaluate(async (src) => {
    const t = (window as unknown as { __t: TextApi }).__t;
    return (await t.minifyJs(src, { sourceMap: true, filename: 'js/app.js' })).map;
  }, SCRIPT);
  const parsed = JSON.parse(map!) as { sourcesContent: string[]; names: string[] };
  expect(parsed.sourcesContent[0]).toBe(SCRIPT);
  expect(parsed.names).toContain('greetingMessage');
});

test('the 2017 range rewrites newer syntax down; the latest range keeps it', async ({ page }) => {
  await textApi(page);
  const out = await page.evaluate(async (src) => {
    const t = (window as unknown as { __t: TextApi }).__t;
    return {
      legacy: (await t.minifyJs(src, { preset: 'legacy' })).code,
      modern: (await t.minifyJs(src, { preset: 'modern' })).code,
    };
  }, SCRIPT);
  expect(out.legacy).not.toContain('??');
  expect(out.modern).toContain('??');
});

test('files mode writes .map files and points at them', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/text/app.js');
  await page.getByRole('button', { name: 'Optimize 1 file' }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();
  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download zip' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await downloaded.path())));
  expect(Object.keys(zip)).toContain('app.js.map');
  expect(strFromU8(zip['app.js']!)).toMatch(/\/\/# sourceMappingURL=app\.js\.map$/);
});

/* ------------------------------------------------------------------ *
 * Fonts and quality
 * ------------------------------------------------------------------ */

test('choosing the 2017 range adds WOFF fonts for older Safari', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['tests/fixtures/fonts/plex-mono.ttf', 'tests/fixtures/text/site.css']);
  await page.getByRole('radio', { name: 'Since 2017' }).check();
  await expect(page.getByRole('checkbox', { name: 'Also write WOFF for older browsers' })).toBeChecked();

  await page.getByRole('button', { name: /^Optimize 2 files$/ }).click();
  await expect(page.getByLabel('Savings')).toBeVisible();
  await page.getByRole('button', { name: 'plex-mono.ttf' }).click();
  await expect(page.locator('pre')).toContainText('format("woff2")');
  await expect(page.locator('pre')).toContainText('format("woff")');
});

test('a quality preset moves all three sliders together', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
  await page.getByRole('radio', { name: 'Smallest' }).check();
  await expect(page.getByRole('slider', { name: 'AVIF quality' })).toHaveValue('38');
  await expect(page.getByRole('slider', { name: 'WebP quality' })).toHaveValue('62');

  await page.getByRole('slider', { name: 'AVIF quality' }).fill('41');
  await expect(page.getByRole('radio', { name: 'Custom' })).toBeChecked();
});
