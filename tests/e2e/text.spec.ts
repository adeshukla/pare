import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Text minifier tests, run against the real Lightning CSS, esbuild, SVGO and
 * html-minifier-terser in a browser.
 *
 * Most of these assert what the tools must NOT do. Every one of them ships
 * defaults that delete things, and Law 2 says Pare rewrites but never removes,
 * so the interesting coverage is the rule that survived, the attribute that
 * survived, and the global that kept its name. See ADR-012.
 *
 * Fixtures are read here in Node and passed into the page, not fetched from the
 * dev server. Vite rewrites .css, .html and .svg requests into JavaScript
 * modules, so fetching them would hand the minifier Vite's output instead of the
 * fixture - which is exactly the silent wrong-input bug this note exists to
 * prevent recurring.
 */

const FIXTURES = ['site.css', 'app.js', 'module.mjs', 'page.html', 'logo.svg'] as const;

type FixtureName = (typeof FIXTURES)[number];

const SOURCES = Object.fromEntries(
  FIXTURES.map((name) => [name, readFileSync(`tests/fixtures/text/${name}`, 'utf8')]),
) as Record<FixtureName, string>;

type Text = {
  minifyCss: (source: string, filename: string, preset: string) => Promise<string>;
  minifyJs: (source: string) => Promise<{ code: string; module: boolean }>;
  minifyHtml: (source: string, preset: string) => Promise<string>;
  minifySvg: (source: string, path: string) => Promise<string>;
  isModule: (source: string) => boolean;
  squeezeJs: (js: string, module: boolean) => Promise<string>;
  gzip: (bytes: Uint8Array) => Promise<Uint8Array>;
  brotli: (bytes: Uint8Array) => Promise<Uint8Array>;
};

declare global {
  interface Window {
    __text?: Text;
    __src?: Record<string, string>;
  }
}

const MODULES = { text: '/src/workers/text-codecs.ts' };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    async ([mods, sources]) => {
      window.__text = (await import(/* @vite-ignore */ mods.text)) as unknown as Text;
      window.__src = sources;
    },
    [MODULES, SOURCES] as const,
  );
});

/* ------------------------------- CSS -------------------------------- */

test('CSS gets smaller but keeps every rule, including unused ones', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['site.css']!;
    const min = await window.__text!.minifyCss(source, 'site.css', 'modern');
    return { before: source.length, after: min.length, min };
  });

  expect(out.after).toBeLessThan(out.before);

  // ADR-002: Pare never removes a CSS rule. This class appears in no HTML we
  // were given, and a purging tool would delete it. It must still be here.
  expect(out.min).toContain('promo-banner--seasonal');
  expect(out.min).toContain('--brand');
  expect(out.min).toContain('@media');
  expect(out.min).toContain(':hover');
  // Comments are not rules; dropping them changes nothing that renders.
  expect(out.min).not.toContain('never referenced');
});

test('CSS is prefixed for the browsers actually targeted', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = '.a { user-select: none; }';
    return {
      wide: await window.__text!.minifyCss(source, 'a.css', 'wide'),
      modern: await window.__text!.minifyCss(source, 'a.css', 'modern'),
    };
  });

  // Safari needed -webkit-user-select until 17; the wider target must include it.
  expect(out.wide).toContain('-webkit-user-select');
  expect(out.wide.length).toBeGreaterThanOrEqual(out.modern.length);
});

/* -------------------------------- JS -------------------------------- */

test('a classic script keeps its global names', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['app.js']!;
    const result = await window.__text!.minifyJs(source);
    return { before: source.length, after: result.code.length, code: result.code, module: result.module };
  });

  expect(out.module).toBe(false);
  expect(out.after).toBeLessThan(out.before);

  // ADR-003: top-level names in a classic script are globals. An inline handler
  // or a string passed to setTimeout can reach them, and renaming would break
  // the page silently.
  expect(out.code).toContain('siteConfig');
  expect(out.code).toContain('trackOutboundClick');
  expect(out.code).toContain('initCards');
});

test('a module gets its local names mangled, because it has real scope', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['module.mjs']!;
    const result = await window.__text!.minifyJs(source);
    return { before: source.length, after: result.code.length, code: result.code, module: result.module };
  });

  expect(out.module).toBe(true);
  expect(out.after).toBeLessThan(out.before);
  // A file-scoped constant is invisible outside the module, so shortening is safe.
  expect(out.code).not.toContain('DEFAULT_TIMEOUT_IN_MILLISECONDS');
  // The export is the module's public surface and keeps its name.
  expect(out.code).toContain('createLoader');
});

test('module detection does not mistake a mention of import for a module', async ({ page }) => {
  const out = await page.evaluate(async () => ({
    stringMention: window.__text!.isModule('var x = "import something";'),
    realImport: window.__text!.isModule('import a from "b";'),
    realExport: window.__text!.isModule('export const a = 1;'),
    plain: window.__text!.isModule('var a = 1;'),
  }));

  expect(out.realImport).toBe(true);
  expect(out.realExport).toBe(true);
  expect(out.plain).toBe(false);
  expect(out.stringMention).toBe(false);
});

/* ------------------------------- HTML ------------------------------- */

test('HTML keeps every attribute and the spaces between inline elements', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['page.html']!;
    const min = await window.__text!.minifyHtml(source, 'modern');
    return { before: source.length, after: min.length, min };
  });

  expect(out.after).toBeLessThan(out.before);

  // Law 2 forbids dropping attributes. Each of these is one that an aggressive
  // minifier removes by default.
  expect(out.min).toContain('alt=""');
  expect(out.min).toContain('title=""');
  expect(out.min).toContain('disabled="disabled"');
  expect(out.min).toContain('type="text/javascript"');
  expect(out.min).toContain('href="/docs"');

  // Collapsing this gap to nothing would render "smallerand".
  expect(out.min).toMatch(/<\/em>\s+<strong>/);

  expect(out.min).not.toContain('Safe to remove');
});

test('HTML leaves inline style attributes and event handlers untouched', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source =
      `<div style="background-image: url('img/a.png'); color: red">x</div>` +
      `<button onclick="doThing( 1 , 2 )">go</button>`;
    return window.__text!.minifyHtml(source, 'modern');
  });

  // A style attribute is a declaration list, not a stylesheet. Handing it to a
  // stylesheet parser returns nothing and erases the attribute - which is a
  // deletion, and invisible to a layout diff when it only set a background.
  expect(out).toContain("url('img/a.png')");
  expect(out).toContain('color: red');
  // An on* handler is a statement body, not a program. Same reasoning.
  expect(out).toContain('doThing( 1 , 2 )');
});

/* -------------------------------- SVG ------------------------------- */

test('SVG shrinks but keeps viewBox, ids and its accessible name', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['logo.svg']!;
    const min = await window.__text!.minifySvg(source, 'logo.svg');
    return { before: source.length, after: min.length, min };
  });

  expect(out.after).toBeLessThan(out.before);

  // Removing viewBox breaks every responsively sized SVG.
  expect(out.min).toContain('viewBox');
  // title and desc are the accessible name and description of the graphic.
  expect(out.min).toContain('Pare logo');
  expect(out.min).toContain('<desc>');
  // Ids get referenced from CSS, from JS, and from <use href="#id"> elsewhere.
  expect(out.min).toContain('brandFade');
  expect(out.min).toContain('halo');

  // A def this file never references can still be reached from another document.
  expect(out.min).toContain('altFade');
  // Hidden and empty are states a script reverses.
  expect(out.min).toContain('tooltipLayer');
  expect(out.min).toContain('annotations');
});

/* --------------------------- Compression ---------------------------- */

test('gzip is smaller and decompresses back to the same bytes', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['site.css']!;
    const bytes = new TextEncoder().encode(source);
    const gz = await window.__text!.gzip(bytes);

    const back = await new Response(
      new Blob([gz as BufferSource]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();

    return { before: bytes.byteLength, after: gz.byteLength, identical: back === source };
  });

  expect(out.after).toBeLessThan(out.before);
  expect(out.identical).toBe(true);
});

test('brotli beats gzip, which is why it is worth the download', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['page.html']!;
    const bytes = new TextEncoder().encode(source);
    return {
      raw: bytes.byteLength,
      gzip: (await window.__text!.gzip(bytes)).byteLength,
      brotli: (await window.__text!.brotli(bytes)).byteLength,
    };
  });

  expect(out.brotli).toBeLessThan(out.raw);
  expect(out.brotli).toBeLessThanOrEqual(out.gzip);
});

/* ------------------------------ Failure ----------------------------- */

test('a syntax error is reported rather than producing broken output', async ({ page }) => {
  const failed = await page.evaluate(async () => {
    try {
      await window.__text!.minifyJs('function ( { this is not javascript');
      return false;
    } catch {
      return true;
    }
  });

  // The worker turns this into a skip-and-warn; the file is copied unchanged.
  expect(failed).toBe(true);
});

/* --------------------- Optional deeper passes ----------------------- */

test('the deeper JS pass still refuses to rename a classic script global', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['app.js']!;
    const first = await window.__text!.minifyJs(source);
    return {
      module: first.module,
      squeezed: await window.__text!.squeezeJs(first.code, first.module),
    };
  });

  expect(out.module).toBe(false);
  // Terser is far more aggressive than esbuild, so this is where `toplevel`
  // being false actually earns its place - ADR-003 applies to both passes.
  expect(out.squeezed).toContain('siteConfig');
  expect(out.squeezed).toContain('trackOutboundClick');
  expect(out.squeezed).toContain('initCards');
});

test('the deeper JS pass does mangle a module, because it has scope', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const source = window.__src!['module.mjs']!;
    const first = await window.__text!.minifyJs(source);
    return {
      module: first.module,
      squeezed: await window.__text!.squeezeJs(first.code, first.module),
    };
  });

  expect(out.module).toBe(true);
  expect(out.squeezed).not.toContain('DEFAULT_TIMEOUT_IN_MILLISECONDS');
  expect(out.squeezed).toContain('createLoader');
});
