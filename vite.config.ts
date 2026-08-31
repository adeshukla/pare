import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },

  // The @jsquash codecs ship WASM alongside their ES modules. Pre-bundling them
  // rewrites the import.meta.url the WASM is resolved against, so they are left
  // alone and loaded as-is by the dynamic imports in src/workers/codecs.ts.
  optimizeDeps: {
    exclude: [
      '@jsquash/avif',
      '@jsquash/jpeg',
      '@jsquash/oxipng',
      '@jsquash/png',
      '@jsquash/resize',
      '@jsquash/webp',
    ],
  },

  build: {
    target: 'es2022',
    // scripts/check-budget.mjs walks this to size the *initial* graph only.
    // Without it the budget check cannot tell a lazy codec chunk from the entry.
    manifest: true,
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
