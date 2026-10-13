import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG 2.2 AA, checked with axe-core on every main screen in both themes.
 * Added after an audit found low-contrast badges, a missing top-level heading
 * once files are dropped, and scrolling boxes a keyboard could not reach.
 */

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

async function violations(page: Page) {
  await page.addScriptTag({ content: AXE });
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ html: string }> }> }> } }).axe;
    const r = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`);
  });
  return found;
}

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations, ${scheme} theme`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('input[type=file]').waitFor({ state: 'attached' });
    expect(await violations(page), 'landing').toEqual([]);

    await page.locator('input[type=file]').setInputFiles([
      'tests/fixtures/photo.jpg',
      'tests/fixtures/fonts/plex-mono.woff2',
      'tests/fixtures/text/site.css',
    ]);
    expect(await violations(page), 'settings').toEqual([]);

    await page.getByRole('button', { name: /^Optimize 3 files$/ }).click();
    await expect(page.getByLabel('Savings')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'photo.jpg', exact: true }).click();
    await page.getByRole('img', { name: 'Original' }).waitFor();
    expect(await violations(page), 'results').toEqual([]);
  });
}
