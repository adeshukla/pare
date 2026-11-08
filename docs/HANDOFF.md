# Handoff: where we were

Written at the end of a working session so a new session (or another PC) can
pick up without the chat history. Read AGENTS.md first, then docs/STATUS.md,
then this. Last updated 2026-11-08, at commit `aaae8fc` on `master`.

## State

- `master` and `features/overnight` are the same commit and both pushed.
  Production (https://pare.devstash.me) was deployed by hand with
  `npx wrangler pages deploy dist --project-name=pare --branch=master` from that
  commit. Nothing is uncommitted.
- Checks passing at that point: lint, typecheck, 273 unit tests, build, size
  budget (118.6 KB of 150 KB). Chromium and Firefox e2e for tasks.spec.ts and
  formats.spec.ts passed. WebKit and the full suite were not rerun by hand.

## What this stretch of work did

1. **Code "after" size is the saved file** (ADR-045). Minified CSS/JS used to
   show the gzip/brotli size as "after" while Save gave the full minified file.
   Rows and headline now show the saved file; the compressed figure is a
   separate, labelled estimate (`bytesCompressed`, `compressedNote`, all five
   languages).
2. **Known gaps** worked through (ADR-046): preview port is strict and never
   reused; 200-page / 300-image scale test (Chromium only); AGENTS.md wording.
3. **Firefox speed** (ADR-047): measured, not fixable. Firefox runs WASM codecs
   5-11x slower per core; no thread, tile, SIMD or compiler setting helped.
   Output is byte-identical. Firefox visitors get a one-line notice
   (`slowBrowser`), detected with `'mozInnerScreenX' in window`.
4. **HEIC** (ADR-048): a HEIC-only drop runs as the HEIC-to-JPG page does
   (one full-size JPEG each), for that drop only. Saved settings are not
   touched (`effective` in src/App.tsx). Whole-site HEIC conversion stays off
   (ADR-026).
5. **Code review findings fixed**: codec start failures keep their real error
   and only memory-like ones are retried (src/workers/once.ts); Playwright
   starts only the servers the selected projects need; compressed-size report
   uses an explicit `compressedKnown` flag.
6. **Search engines are told after each deploy**: `scripts/submit-sitemap.mjs`
   runs as the last step of the CI deploy job. Bing and others via IndexNow
   (key file `public/322e09e4ec3215b509abd1f922c4af8e.txt`); Google via the
   Search Console API only when secrets exist. A first IndexNow run returned 202
   for 35 URLs.

## Still open

- **Google sitemap submit is not enabled.** Needs a Google Cloud service
  account added as an owner in Search Console, then repo secret
  `GSC_SERVICE_ACCOUNT_JSON` and repo variable `GSC_SITE`
  (`sc-domain:devstash.me`). A google-site-verification TXT record exists on
  devstash.me; whether the property is verified was not confirmed.
- **Bing Webmaster Tools**: add the site once (import from Search Console) and
  add the sitemap by hand; there is no sitemap API without an API key.
- **CI deploy** needs repo secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. The Actions run after the last push was not checked.
- Not built: translating the rarer per-file notes and advanced settings;
  streaming zip output for very large sites (docs/SCALING.md section 2).
- Platform limits, deliberately left: WebKit has no worker OffscreenCanvas;
  verification runs with scripts off (ADR-017); site-mode `<picture>` is
  conservative (ADR-021); out-of-memory recovery cannot be provoked in CI.
- Before launch (docs/STATUS.md): real-theme and real-photo checks.

## Practical notes

- Windows, Git Bash. Python is not installed; use node for scripted edits.
- Run one engine at a time: `npx playwright test --project=chromium <spec>`.
  Preview projects use `PARE_PREVIEW_PORT` (default 4173).
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
