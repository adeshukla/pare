/**
 * Text minifiers, lazily loaded.
 *
 * The configuration in this file is the interesting part, not the plumbing.
 * Every one of these tools ships defaults that delete things, and Law 2 says
 * Pare does not delete things. So each is turned down to "rewrite, never
 * remove", and each deviation from the library default is justified where it
 * is made. See ADR-012.
 */

import { TARGETS, type TargetPreset } from '../lib/settings';

// Type-only imports. These are erased at compile time, so naming the modules
// here does not pull a single byte of codec into the bundle - the real loading
// is the dynamic import inside each function.
import type * as BrotliWasm from 'brotli-wasm';
import type * as Esbuild from 'esbuild-wasm/esm/browser';
import type * as LightningCss from 'lightningcss-wasm';

/* ------------------------------------------------------------------ *
 * CSS - Lightning CSS
 * ------------------------------------------------------------------ */

let lightningReady: Promise<typeof LightningCss> | undefined;

async function loadLightning() {
  lightningReady ??= (async () => {
    const mod = await import('lightningcss-wasm');
    await mod.default();
    return mod;
  })();
  return lightningReady;
}

/** Lightning CSS targets are `major << 16 | minor << 8`. */
function encodeTargets(preset: TargetPreset): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [browser, version] of Object.entries(TARGETS[preset].browsers)) {
    const major = Math.floor(version);
    const minor = Math.round((version - major) * 10);
    out[browser] = (major << 16) | (minor << 8);
  }
  return out;
}

export async function minifyCss(
  source: string,
  filename: string,
  preset: TargetPreset,
): Promise<string> {
  const { transform } = await loadLightning();
  const result = transform({
    filename,
    code: new TextEncoder().encode(source),
    minify: true,
    targets: encodeTargets(preset),
    // `unusedSymbols` is Lightning's dead-rule remover. It is exactly the
    // feature ADR-002 rules out permanently, and it stays off.
    errorRecovery: true,
  });
  return new TextDecoder().decode(result.code);
}

/* ------------------------------------------------------------------ *
 * JS - esbuild
 * ------------------------------------------------------------------ */

let esbuildReady: Promise<typeof Esbuild> | undefined;

async function loadEsbuild() {
  esbuildReady ??= (async () => {
    // The package root resolves to the Node build, which has no `initialize`.
    // The browser ESM entry has to be named explicitly.
    const mod = await import('esbuild-wasm/esm/browser.js');
    const { default: wasmURL } = await import('esbuild-wasm/esbuild.wasm?url');
    // worker:false because this already runs inside our own worker; letting
    // esbuild spawn another would put a second thread under a pool slot.
    await mod.initialize({ wasmURL, worker: false });
    return mod;
  })();
  return esbuildReady;
}

/** A file using import/export has its own scope; a classic script does not. */
export function isModule(source: string): boolean {
  return /^\s*(import\s|export\s|export\{|import\{)/m.test(source);
}

/**
 * Classic scripts get whitespace and syntax minification only.
 *
 * Top-level names in a classic script are globals. Another script, an inline
 * handler, or a string passed to setTimeout can reach them, and none of that is
 * visible to a minifier. Renaming them is the same undecidable problem as tree
 * shaking a classic script, which ADR-003 already settled. Modules have real
 * scope, so there identifier mangling is safe.
 */
export async function minifyJs(source: string): Promise<{ code: string; module: boolean }> {
  const esbuild = await loadEsbuild();
  const module = isModule(source);
  const result = await esbuild.transform(source, {
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: module,
    format: module ? 'esm' : undefined,
    legalComments: 'inline',
    target: 'es2017',
  });
  return { code: result.code, module };
}

/* ------------------------------------------------------------------ *
 * HTML
 * ------------------------------------------------------------------ */

export async function minifyHtml(source: string, preset: TargetPreset): Promise<string> {
  const { minify } = await import('html-minifier-terser');
  return minify(source, {
    // Safe: comments carry nothing the browser renders. Conditional comments
    // are recognised and kept by the library itself.
    removeComments: true,

    // `collapseWhitespace: true` alone will delete the space between two inline
    // elements, which visibly joins words. Conservative collapsing reduces runs
    // of whitespace to a single space and never to nothing.
    collapseWhitespace: true,
    conservativeCollapse: true,

    // Only whole <style> and <script> elements are minified.
    //
    // html-minifier-terser also offers these callbacks a style attribute's
    // declaration list and an on* handler's statement body. Neither is a
    // stylesheet or a program, so handing them to Lightning CSS or esbuild
    // parses them as empty and returns nothing - which silently erases the
    // attribute. That is exactly the deletion Law 2 forbids, and it is invisible
    // in a layout diff when the attribute only set a background image.
    //
    // Law 3 already treats an inline style attribute as untouchable. This is the
    // same rule, applied one layer down.
    minifyCSS: (css: string, type?: string) =>
      type === undefined ? minifyCss(css, 'inline.css', preset) : css,
    minifyJS: (js: string, type?: string) =>
      type === undefined ? minifyJs(js).then((r) => r.code) : js,

    // Everything below this line is off on purpose. Law 2 forbids dropping
    // attributes, and each of these does exactly that:
    //   removeAttributeQuotes   breaks on values a later edit makes unsafe
    //   removeEmptyAttributes   alt="" is meaningful; removing it is not cosmetic
    //   removeRedundantAttributes  type="text/javascript" may be read by scripts
    //   collapseBooleanAttributes  rewrites attributes CSS selectors may match
    //   removeOptionalTags      changes the DOM tree that CSS and JS see
    removeAttributeQuotes: false,
    removeEmptyAttributes: false,
    removeRedundantAttributes: false,
    collapseBooleanAttributes: false,
    removeOptionalTags: false,
    useShortDoctype: false,
    sortAttributes: false,
    sortClassName: false,
  });
}

/* ------------------------------------------------------------------ *
 * SVG
 * ------------------------------------------------------------------ */

export async function minifySvg(source: string, path: string): Promise<string> {
  const { optimize } = await import('svgo/browser');
  const result = optimize(source, {
    path,
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          // Turned off, all for the same reason: each one removes something a
          // page outside this file may depend on, and Law 2 says Pare rewrites
          // but never removes.
          //
          // (removeViewBox and removeTitle are not in SVGO 4's preset-default at
          // all, so they need no entry here. The tests still assert that viewBox
          // and <title> survive, so a future SVGO adding them back is caught.)
          overrides: {
            // Attributes are named explicitly in Law 2. Both of these drop them.
            removeEmptyAttrs: false,
            removeDeprecatedAttrs: false,

            // <desc> is the accessible description of the graphic.
            removeDesc: false,

            // IDs are referenced from CSS, from JS, and from <use href="file.svg#id">
            // in another document. None of that is visible from inside one SVG.
            cleanupIds: false,
            removeUselessDefs: false,

            // "Hidden" and "empty" are states script routinely reverses.
            removeHiddenElems: false,
            removeEmptyContainers: false,

            // An external stylesheet can put back the stroke or fill that makes
            // these meaningful, and SVGO cannot see that stylesheet.
            removeUselessStrokeAndFill: false,
            removeUnknownsAndDefaults: false,

            // Moving <style> rules onto elements changes specificity, so a rule
            // in the page's own stylesheet can stop winning.
            inlineStyles: false,
          },
        },
      },
    ],
  });
  return result.data;
}

/* ------------------------------------------------------------------ *
 * Transport compression
 * ------------------------------------------------------------------ */

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BufferSource])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function brotli(bytes: Uint8Array): Promise<Uint8Array> {
  // There is no native brotli compressor; this is the one place a WASM download
  // is unavoidable, which is why the toggle is off by default.
  const mod = await import('brotli-wasm');
  const brotliWasm = await (mod.default as unknown as Promise<typeof BrotliWasm>);
  return brotliWasm.compress(bytes, { quality: 11 });
}

/* ------------------------------------------------------------------ *
 * Bundling - modules only
 * ------------------------------------------------------------------ */

export type BundleResult = {
  code: string;
  /** Folder-relative paths esbuild pulled into the bundle, entry included. */
  inputs: string[];
  /** Bare specifiers left alone, and anything else worth telling the user. */
  warnings: string[];
  /** True when a dynamic import was seen, which makes removing inputs unsafe. */
  dynamic: boolean;
};

/**
 * Bundle one `<script type="module">` graph.
 *
 * ADR-003 permits this for modules and forbids it for classic scripts, and the
 * reason is scope: a module's imports and exports are declarations esbuild can
 * follow, while a classic script's top-level names are globals that anything can
 * reach. That distinction is the whole basis for treating the two differently.
 *
 * There is no filesystem here, so resolution is served entirely from the files
 * the user dropped in. A bare specifier - `import x from "lodash"` - cannot be
 * resolved without a package registry, which `docs/SCOPE.md` rules out. Those are
 * marked external, so the import survives into the output exactly as written and
 * the page behaves no differently than before.
 */
export async function bundleModule(
  entry: string,
  files: Record<string, string>,
): Promise<BundleResult> {
  const esbuild = await loadEsbuild();
  const warnings: string[] = [];
  let dynamic = false;

  const resolve = (specifier: string, importer: string): string | undefined => {
    const base = importer.includes('/') ? importer.slice(0, importer.lastIndexOf('/')) : '';
    const joined = specifier.startsWith('/')
      ? specifier.slice(1)
      : base
        ? `${base}/${specifier}`
        : specifier;

    const parts: string[] = [];
    for (const segment of joined.split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (parts.length === 0) return undefined;
        parts.pop();
        continue;
      }
      parts.push(segment);
    }

    const path = parts.join('/');
    // Browsers require the extension, but be forgiving of a missing one.
    for (const candidate of [path, `${path}.js`, `${path}/index.js`]) {
      if (files[candidate] !== undefined) return candidate;
    }
    return undefined;
  };

  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2017',
    minify: true,
    metafile: true,
    legalComments: 'inline',
    logLevel: 'silent',
    plugins: [
      {
        name: 'dropped-folder',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'entry-point') return { path: entry, namespace: 'folder' };
            if (args.kind === 'dynamic-import') dynamic = true;

            const relative = /^[./]/.test(args.path);
            if (!relative) {
              // A package name. Leaving it external keeps the import verbatim.
              warnings.push(
                `"${args.path}" comes from a package rather than your folder, so the import was left as it is.`,
              );
              return { path: args.path, external: true };
            }

            const resolved = resolve(args.path, args.importer);
            if (!resolved) {
              warnings.push(
                `Could not find "${args.path}" imported by ${args.importer}, so the import was left as it is.`,
              );
              return { path: args.path, external: true };
            }
            return { path: resolved, namespace: 'folder' };
          });

          build.onLoad({ filter: /.*/, namespace: 'folder' }, (args) => ({
            contents: files[args.path] ?? '',
            loader: 'js',
            resolveDir: '/',
          }));
        },
      },
    ],
  });

  const output = result.outputFiles?.[0];
  if (!output) throw new Error('the bundler produced nothing');

  return {
    code: output.text,
    inputs: Object.keys(result.metafile?.inputs ?? {}).map((p) => p.replace(/^folder:/, '')),
    warnings,
    dynamic,
  };
}

/* ------------------------------------------------------------------ *
 * Optional deeper pass - JavaScript only
 *
 * There is no second CSS pass. CSSO was tried for it and rejected: fed the
 * modern range syntax Lightning CSS emits (`@media (width>=768px)`), it cannot
 * parse the at-rule and drops the whole block without a word. Silent deletion is
 * exactly what Law 2 forbids, and no configuration turns it off - the parser
 * simply predates the syntax. See ADR-020.
 * ------------------------------------------------------------------ */

/**
 * A second JS pass with Terser, which is slower than esbuild and usually a few
 * percent smaller.
 *
 * `toplevel` is the load-bearing option and it follows ADR-003 exactly. For a
 * classic script it stays false, so Terser will neither rename nor delete a
 * top-level declaration - those are globals, and anything on the page can reach
 * them. For a module it is safe to turn on, because the file has real scope.
 */
export async function squeezeJs(js: string, module: boolean): Promise<string> {
  const { minify } = await import('terser');
  const result = await minify(js, {
    module,
    compress: { toplevel: module },
    mangle: { toplevel: module },
    format: { comments: 'some' },
  });
  return result.code ?? js;
}
