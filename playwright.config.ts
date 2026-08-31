import { defineConfig, devices } from '@playwright/test';

/**
 * The codecs are WASM and only run in a browser, so the fixture tests AGENTS.md
 * asks for - "output is decodable and smaller" - cannot live in the node suite.
 * They run here, against the real encoders, on real image files.
 *
 * Runs against the dev server so the specs can import src/workers/codecs.ts
 * directly and exercise each codec in isolation, not only through the UI.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  // WASM codecs on a cold cache are not fast. Encoding a 1200px AVIF at speed 6
  // is seconds, not milliseconds.
  timeout: 120_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
