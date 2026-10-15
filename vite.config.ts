import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TASKS } from './src/tasks';

type HeaderRule = { pattern: RegExp; set: Array<[string, string]>; detach: string[] };

/**
 * public/_headers as Cloudflare Pages reads it: a path pattern, then indented
 * `Name: value` lines to add and `! Name` lines to remove what an earlier rule
 * added. Every rule whose pattern matches applies, in order.
 */
function headerRules(): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of readFileSync('public/_headers', 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const glob = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      rules.push({ pattern: new RegExp('^' + glob + '$'), set: [], detach: [] });
      continue;
    }
    const rule = rules.at(-1);
    const detach = /^\s+!\s*([\w-]+)\s*$/.exec(line);
    const set = /^\s+([\w-]+):\s*(.+)$/.exec(line);
    if (rule && detach) rule.detach.push(detach[1]!);
    else if (rule && set) rule.set.push([set[1]!, set[2]!.trim()]);
  }
  return rules;
}

/**
 * The preview sends exactly what production sends, path by path, so the
 * production tests run under the real policy (ADR-040). Not on the dev server:
 * it injects its own client into workers, and WebKit refuses those imports
 * under COEP, which hangs the threaded AVIF encoder - a dev-only failure that
 * the production build does not have.
 */
function productionHeaders(): Plugin {
  return {
    name: 'pare-production-headers',
    configurePreviewServer(server) {
      const rules = headerRules();
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]!;
        const headers = new Map<string, string>();
        for (const rule of rules) {
          if (!rule.pattern.test(path)) continue;
          for (const name of rule.detach) headers.delete(name.toLowerCase());
          for (const [name, value] of rule.set) {
            const key = name.toLowerCase();
            headers.set(key, headers.has(key) ? headers.get(key) + ', ' + value : value);
          }
        }
        for (const [name, value] of headers) res.setHeader(name, value);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), productionHeaders()],
  worker: { format: 'es' },

  // clean-css and terser, which html-minifier-terser pulls in, read `process`
  // at module scope. They are Node libraries being run somewhere they were not
  // written for; this is the smallest shim that satisfies them. Pare's own code
  // never touches `process` - eslint.config.js enforces that.
  define: {
    process: JSON.stringify({ env: {}, argv: [], platform: 'browser', version: '' }),
    // Names this build's offline cache, so a deploy replaces the last one.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },

  optimizeDeps: {
    // WASM-bearing packages resolve their binaries against import.meta.url.
    // Pre-bundling rewrites that and the WASM stops loading, so these are served
    // as authored and pulled in by the dynamic imports in src/workers/*-codecs.ts.
    exclude: [
      '@jsquash/avif',
      '@jsquash/jpeg',
      '@jsquash/oxipng',
      '@jsquash/png',
      '@jsquash/resize',
      '@jsquash/webp',
      'brotli-wasm',
      'esbuild-wasm',
      'lightningcss-wasm',
      'libheif-js',
      'woff2-encoder',
    ],

    // These two are CommonJS underneath (clean-css, terser, relateurl), so they
    // have to be pre-bundled to be importable at all. Naming them here also
    // pins the work to server start-up: discovered later, Vite re-optimizes and
    // reloads the page mid-run, which tears down whatever was mid-encode.
    include: ['html-minifier-terser', 'svgo/browser', 'terser', 'utif2', 'omggif'],
  },

  build: {
    target: 'es2022',
    // scripts/check-budget.mjs walks this to size the *initial* graph only.
    // Without it the budget check cannot tell a lazy codec chunk from the entry.
    manifest: true,
    // The task pages (ADR-035) are the same app under their own addresses.
    rolldownOptions: {
      input: {
        main: 'index.html',
        ...Object.fromEntries(TASKS.map((t) => [t.slug, `tools/${t.slug}/index.html`])),
      },
    },
  },

  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // Browser-only modules; they are covered by the Playwright run instead.
      exclude: ['src/lib/pool.ts', 'src/lib/ingest.ts', 'src/lib/emit.ts'],
    },
  },
});
