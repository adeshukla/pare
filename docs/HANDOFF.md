# Handoff: where we were

Written at the end of a working session so a new session (or another PC) can
pick up without the chat history. Read AGENTS.md first, then docs/STATUS.md,
then this. Last updated 2026-11-09, at commit `759b2d5` on `master`.

## State

- `master` is at `759b2d5`: **committed locally, not pushed, not deployed.**
  `origin/master` and production (https://pare.devstash.me, deployed by hand with
  `npx wrangler pages deploy dist --project-name=pare --branch=master`) are at
  `397b691`, so production does not have the pool fix below yet.
- Passing on `759b2d5`: lint, typecheck, 273 unit tests, size budget (118.8 KB of
  150 KB). Browser e2e was **not** run for this commit (no Playwright browsers on
  this PC; installed Chrome is used for the CLI instead). WebKit and the full suite
  have not been rerun by hand.

## Latest session (2026-11-09): dummy-site test and the resize fix

Full write-up: docs/DUMMY-RUN-2026-11-09.md.

- Ran an 18-file generated site (6 grainy 2400 px photos, screenshots, logo, bloated
  CSS/JS/SVG, font, two pages, traps for Law 3) through the CLI: 7.54 MB to 1.69 MB
  (77%), 6 s, verification clean, untraceable files kept their names.
- **Bug found and fixed:** the pool made cores-1 workers (23 on a 24-core PC), the
  browser ran out of WASM memory, and one photo skipped its resize in 9 of 21 runs.
  `src/lib/pool.ts` now caps the pool at 8: 0 failures in 10 runs, identical output,
  6 s instead of 10 s. Untested: very large sites with the smaller pool.
- The resize failure note now carries the real error (`pipeline.worker.ts`).
- The CLI prints the "Left alone" list; `PARE_BROWSER_CHANNEL=chrome` runs it with
  installed Chrome instead of the Playwright download.
- Open from that run: check the page says screenshots become 256-colour PNGs (lossy)
  and decide whether a lossless switch is wanted; the CLI's "after" headline varied
  by ~0.05 MB between runs while the written files were identical.

## Earlier work (2026-11-08)

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

- **Push and deploy `759b2d5`** (needs the owner's go-ahead), then run the browser
  e2e on a PC that has the Playwright browsers.
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
