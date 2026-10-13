import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TASKS } from './src/tasks';

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },

  // The isolation headers production sends (public/_headers), on the preview of
  // the built site, which the production tests run against. Not on the dev
  // server: it injects its own client into workers, and WebKit refuses those
  // imports under COEP, which hangs the threaded AVIF encoder - a dev-only
  // failure that the production build does not have.
  preview: { headers: ISOLATION },

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
