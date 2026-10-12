# Scaling Pare

Pare has no server (Law 1). Every byte of work happens in the visitor's own
browser tab, so "scaling" means three different things, and only one of them
costs money.

| | What grows | What it costs | Where the limit is |
|---|---|---|---|
| **Serving** | visitors | static files from a CDN | effectively none |
| **Work per visit** | size of the site someone drops | their CPU and memory | one browser tab |
| **Reach** | people who know Pare exists | time | launch and distribution |

---

## 1. Serving: done right, a million visitors cost nothing

**Numbers, from the current build:**

| | Size |
|---|---|
| First visit (page, styles, app code) | 96.5 KB gzipped |
| Every tool, if someone uses all of them once | ~45 MB raw, ~11 MB compressed |
| Largest single file | Lightning CSS, 16 MB raw (3.8 MB gzipped) |

Each tool is downloaded only when its first file arrives, and only once: assets
are content-hashed and now served with `Cache-Control: immutable` for a year
(`public/_headers`), and the offline service worker (ADR-023) keeps them after
that. A returning visitor downloads nothing but the page.

**Hosting.** Cloudflare Pages serves static files with no bandwidth charge, and
its 25 MiB per-file limit is above the largest asset. There is nothing to scale
up: no instances, no database, no queue. A traffic spike from a launch is the
CDN's problem, which is the point of the architecture.

**To do before launch** (all in `docs/STATUS.md`):

1. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, create the Pages
   project, run the deploy job once and read its log.
2. Point `pare.devstash.me` at it.
3. Check the response headers in production: COOP/COEP (multi-threaded AVIF),
   `immutable` on `/assets/*`, `no-cache` on `/sw.js`.

**Watching it without telemetry.** Pare sends nothing anywhere, and that stays
true. Cloudflare's server-side Pages analytics (requests, bandwidth, countries)
needs no script in the page, so it does not break Law 1. That is the only usage
signal, plus GitHub issues and stars.

---

## 2. Work per visit: how big a site one tab can take

| Limit today | Value | Why |
|---|---|---|
| Files per drop | 5,000 | `MAX_FILES` in `ingest.ts` |
| Workers | CPU cores − 1 | `pool.ts` |
| Pages checked at once | 3 page × width pairs | `verify.ts` |
| Memory | everything held at once | input, output and the zip all live in RAM |

**Measured:** 20 photos in 10–14 s (Chromium), 30–46 s (WebKit), ~90 s (Firefox).
A 40-page site checked in 13–20 s in Chromium, 37–60 s in WebKit, ~90 s in
Firefox. Nothing has yet been run on a real theme with hundreds of assets.

**The ceiling is memory, not speed.** A large WordPress `uploads/` folder can be
several gigabytes, and today Pare keeps every input, every output and then the
whole zip in memory at once. In order of payoff:

1. **Stream the zip.** Use fflate's streaming `Zip` and write chunks as each
   file finishes, instead of `zipSync` over everything at the end. Removes the
   largest single allocation.
2. **Stream to a folder.** "Save to a folder…" (ADR-024) can write each file as
   soon as it is done and release it, so a Chromium user's memory stays flat no
   matter how big the site is.
3. **Release as you go.** Drop each input's bytes once its output is written,
   unless the comparison view needs them.
4. **Measure the verifier on a real site**, then tune its lane count from data
   (it is marked `ponytail:` in `verify.ts`).
5. **Raise `MAX_FILES`** only after 1–3, and say in the UI when a drop was capped.

---

## 3. Reach: getting it to the people it is for

The audience is people **without** a build step: static-site owners, WordPress
and PHP theme developers, students shipping by FTP. In order:

1. **Launch once, properly.** Show HN, r/webdev, r/wordpress, Product Hunt. The
   post is a before-and-after on *real* photographs and a *real* WordPress theme,
   not the test fixtures, which flatter the encoders.
2. **A benchmark page.** Five real sites (WordPress, Hugo, Jekyll, plain HTML, a
   portfolio): bytes before, bytes after, and what was left alone and why. Honest
   numbers are the marketing (Law 5).
3. **WordPress specifically.** "Shrink your theme or your uploads folder without
   a plugin" is a precise, large, underserved need, and ADR-027 makes it safe.
   Write one guide for each: a theme folder, and `wp-content/uploads`.
4. **Words people search for.** One short guide page each for "convert HEIC to
   JPG", "convert images to AVIF/WebP", "minify CSS online" and "subset a font".
   Each is a static page; each ends with the drop zone.
5. **Later, the same engine elsewhere.** The `pare ./site` CLI name is reserved
   (AGENTS.md). It reaches people with Node — not today's audience — so it comes
   after the web app has users, and it still has no server.

---

## 4. Keeping it free

Law 1 makes Pare free to run. Its costs are the domain, and maintainers' time.

- **GitHub Sponsors / Open Collective** for time, once there are users.
- **No paid tier that needs a server**: no accounts, no cloud processing, no
  "pro limits". If a paid product is ever built, it is a separate local tool
  (for example the CLI for CI pipelines) and the web app stays complete.

---

## 5. Quality at scale

The cost of a bug grows with users, and Pare's one promise is that it cannot
break a site. So:

- **CI runs every engine.** Lint, types, unit tests, build and budget, then the
  browser suite in Chromium, Firefox and WebKit, plus the offline test against
  the built site. Run engines one at a time locally; together on one machine the
  slower two time out.
- **A real-site corpus.** Commit two or three real, permissively licensed sites
  (a WordPress theme, a static blog) as fixtures and run whole-site mode against
  them in CI.
- **Bug reports without telemetry.** A "Copy diagnostic" button that puts the
  browser, settings, file types and any warnings (never file contents) on the
  clipboard, to paste into a GitHub issue.
- **Dependabot plus the existing pins.** Review codec updates by running the
  codec tests, which check output decodes and is smaller.

---

## Order of work

1. Deploy (section 1).
2. Real-site testing and the benchmark page (sections 3.2 and 5).
3. Launch.
4. Streaming zip and stream-to-folder (section 2.1–2.3), driven by what real
   users drop.
5. Guides and the WordPress pages (section 3.3–3.4).
