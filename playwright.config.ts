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

  // WASM codecs on a cold cache are not fast, and how slow depends heavily on
  // the engine: one photo through the full ladder takes about 2s in Chromium
  // and about 19s in Firefox, before six parallel workers each compile their own
  // copy of a 3.4 MB AVIF encoder. The old 30s expectation was calibrated on
  // Chromium alone and failed five image tests in Firefox that were in fact
  // producing byte-identical, correct output.
  timeout: 180_000,
  expect: { timeout: 90_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  /**
   * All three engines, because Pare's fallback matrix exists for the two that
   * are not Chromium. `AGENTS.md` requires shipping both ingest paths and never
   * gating a core feature behind a Chromium-only API - claims that are worth
   * nothing until something actually runs there.
   *
   * Firefox has no File System Access API, and WebKit's AVIF and OffscreenCanvas
   * support differs from Chrome's. Those are precisely the branches under test.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /offline|production/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /offline|production/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /offline|production/ },
    // Against the built site with production's headers. The service worker
    // only registers in a production build (ADR-023), and only there do the
    // isolation headers switch on the threaded AVIF encoder (ADR-032).
    {
      name: 'offline',
      testMatch: /(offline|production)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'production-firefox',
      testMatch: /production\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'production-webkit',
      testMatch: /production\.spec\.ts/,
      use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:4173' },
    },
  ],

  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npx vite build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
