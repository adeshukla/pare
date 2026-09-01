import { expect, test } from '@playwright/test';

/**
 * The two ways a folder actually gets into Pare, driven through the real UI.
 *
 * AGENTS.md: "Ship both paths. Never gate a core feature behind a Chromium-only
 * API." The unit suite covers the entries-API walk in isolation; what only a
 * browser can show is that the drop zone wires them up - that the folder button
 * appears when the File System Access API exists, that a real `drop` event
 * reaches the handler, and that neither one throws when the user changes their
 * mind.
 */

/** A directory handle shaped like the one showDirectoryPicker resolves to. */
const FAKE_PICKER = `
  window.__makeFile = (name, content) => ({
    kind: 'file',
    name,
    getFile: async () => new File([content], name),
  });
  window.__makeDir = (name, children) => ({
    kind: 'directory',
    name,
    entries: async function* () {
      for (const [key, value] of Object.entries(children)) yield [key, value];
    },
  });
`;

test('offers the folder button when the browser supports directory picking', async ({ page }) => {
  await page.addInitScript(`${FAKE_PICKER}; window.showDirectoryPicker = async () => null;`);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose a folder' })).toBeVisible();
});

test('hides the folder button when the browser does not support it', async ({ page }) => {
  // Every other browser. The feature must degrade, not disappear: "Choose files"
  // and drag-drop both still work.
  await page.addInitScript(`delete window.showDirectoryPicker;`);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose a folder' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
});

test('reads a whole directory tree through showDirectoryPicker', async ({ page }) => {
  await page.addInitScript(`
    ${FAKE_PICKER}
    window.showDirectoryPicker = async () =>
      window.__makeDir('site', {
        'index.html': window.__makeFile('index.html', '<!doctype html><p>hi</p>'),
        css: window.__makeDir('css', {
          'site.css': window.__makeFile('site.css', '.a{color:red}'),
        }),
        node_modules: window.__makeDir('node_modules', {
          'dep.js': window.__makeFile('dep.js', 'nope'),
        }),
      });
  `);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose a folder' }).click();

  // A page came in, so Pare offers whole-site mode.
  await expect(page.getByRole('button', { name: /^Optimize the site$/ })).toBeVisible();
  await expect(page.getByText('2 dropped')).toBeVisible();
});

test('a cancelled folder pick is not treated as an error', async ({ page }) => {
  // The picker rejects with AbortError when the user closes the dialog. That is
  // not a failure and must not surface as one.
  await page.addInitScript(`
    window.showDirectoryPicker = async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    };
  `);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.getByRole('button', { name: 'Choose a folder' }).click();

  await expect(page.getByText('Drop a folder or files here')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a real drop event reaches the handler and loads the files', async ({ page }) => {
  await page.goto('/');

  const transfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['.a{color:red}'], 'site.css', { type: 'text/css' }));
    dt.items.add(new File(['<!doctype html><p>hi</p>'], 'index.html', { type: 'text/html' }));
    return dt;
  });

  // Dispatched on the text inside the zone; React's delegated handler picks it
  // up as it bubbles, exactly as a genuine drop does.
  await page.dispatchEvent('text=Drop a folder or files here', 'drop', {
    dataTransfer: transfer,
  });

  await expect(page.getByText('2 dropped')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Optimize the site$/ })).toBeVisible();
});

test('dragging over the zone gives feedback, and leaving takes it away', async ({ page }) => {
  await page.goto('/');
  const zone = page.getByText('Drop a folder or files here');

  await page.dispatchEvent('text=Drop a folder or files here', 'dragover');
  await expect(zone).toBeVisible();

  await page.dispatchEvent('text=Drop a folder or files here', 'dragleave');
  await expect(zone).toBeVisible();
});
