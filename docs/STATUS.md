# Project status

Updated: 2026-10-13

| | |
|---|---|
| **Phase 0 — Skeleton** | ✅ complete |
| **Phase 1 — Images** | ✅ complete, **not yet deployed** |
| **Phase 2 — Fonts** | ✅ complete |
| **Phase 3 — Text assets** | ✅ complete (CSSO rejected — ADR-020) |
| **Phase 4 — Folder mode** | ✅ complete (critical CSS not shipped — ADR-018) |
| **Phase 5 — Verification** | ✅ complete (web-vitals not shipped — ADR-019) |
| Live at | **https://pare.devstash.me** (also https://pare-3sm.pages.dev) — production from `098a02d` (2026-10-13), deployed with `wrangler pages deploy`. |
| Initial JS | **103.9 KB gzipped** of a 150 KB budget |
| Tests | 241 unit (Vitest) + 91 browser tests × Chromium, Firefox, WebKit on the dev server, plus the built site with production headers (offline in Chromium, a photo in all three engines) — all passing; 4 skips where an engine cannot synthesise a drop or paste |

> **Phases 2 through 5 were built ahead of the Phase 1 launch gate**, at the
> project owner's direction. The gate that was **not** relaxed is the one that
> matters: Phase 4 does not ship without Phase 5's verifier, and it doesn't — the
> download button is not rendered until the before-and-after check comes back
> clean.

---

## What is actually finished, and what is not

Every roadmap phase is built. Three roadmap bullets were deliberately not
shipped, each with an ADR arguing the case rather than a silent omission:

| Not shipped | Phase | Why |
|---|---|---|
| Critical CSS extraction | 4 | Its benefit needs the stylesheet non-render-blocking, which the verifier — scripts disabled by design — cannot check. ADR-018 |
| `web-vitals` in preview | 5 | Measured from a blob URL on the optimizing machine it describes nothing about the user's host. Law 5. ADR-019 |
| CSSO second CSS pass | 3 | Silently deletes at-rules it is too old to parse. Law 2, no safe configuration. ADR-020 |

**The deploy has run, and failed.** The repo is on GitHub
(`adeshukla/pare`) and CI runs on every push. On the last push to `master`
(`10f3d97`, 2026-09-01) the verify and browser jobs passed and **Deploy to
Cloudflare Pages failed at its Publish step** — consistent with the two
Cloudflare secrets not being set, though the log needs a signed-in look to
confirm. `pare.pages.dev` belongs to someone else, so the project will get a
suffixed `*.pages.dev` address; `pare.devstash.me` is the address that matters.

---

## What works

**Files mode** — drop images, fonts and code; get optimized files plus markup to
paste. Nothing is renamed, no markup restructured.

**Site mode** — drop a folder; get a `dist/`. Assets shrink in place, files whose
every reference could be traced get content-fingerprinted, addresses pointing at
them are updated, and then both versions of every page are rendered and compared
before any download is offered.

| | Images | Fonts | CSS / JS / HTML / SVG |
|---|---|---|---|
| Files mode | AVIF + WebP + original, resize ladder, ThumbHash, `<picture>` | split by script, or subset; WOFF2; `@font-face` | minify, prefix, gzip/brotli siblings, optional Terser pass |
| Site mode | re-encoded in place, same format; opt-in AVIF + WebP through `<picture>` (ADR-021) | opt-in subset to the site's own characters (WOFF2 only) | minified in place, opt-in module bundling |

Every risky option is off by default and says why: font subsetting, module
bundling, the deeper Terser pass, and offering AVIF/WebP in site mode.

Each quality slider shows what it costs — one dropped image, encoded at 800px in
the worker pool as the slider settles. Animated GIFs are copied unchanged rather
than flattened to their first frame (ADR-022). The interface follows the system
light/dark setting.

After a run, an image can be compared with its original under a draggable
divider, at fit or actual size. Files can be dropped anywhere on the page or
pasted. Settings are remembered in this browser. On Chromium the output can be
saved straight into an empty folder (ADR-024). After one visit the built site
works offline for every tool used once (ADR-023).

**Inputs** also include HEIC (iPhone photos) and BMP (ADR-026). In whole-site mode
a BMP becomes a PNG under a new name where every reference can be rewritten;
HEIC is left alone there and handled in files mode.

**WordPress and PHP** (ADR-027): server templates are copied byte for byte, any
file they name keeps its name, and a folder with templates is never renamed at
all. A theme with no `.html` is still treated as a site. The `Theme Name:`
header and `/*!` licence comments survive CSS minification.

**JavaScript minification** has three levels — Safe, Balanced (default),
Maximum — and code that reads its own names is held at Safe automatically.
Source maps holding the original code are written in files mode. CSS and
JavaScript output follow the chosen browser range (Latest, Since 2021 by default,
Since 2017), and Since 2017 adds WOFF fonts (ADR-028). Images have Smallest /
Balanced / Crisp quality presets.

**Also:** a dropped .zip is opened in place (ADR-029); whole-site mode scales
images down to the size they are shown at, measured at four screen widths
(ADR-030); an opt-in report lists CSS that matched nothing, without removing
any (ADR-031); files mode can make one size — fitted, or cropped to fill — in a
single format; and one large image is spread across idle workers (ADR-032).

**Zips** are built in chunks, with already-compressed files stored rather than
deflated again. Hashed assets are served `immutable` for a year. See
`docs/SCALING.md` for how Pare scales and what to build next.

## Measured

| | Before | After | Change |
|---|---|---|---|
| `photo.jpg` 1200×800 | 175.7 KB | 3.3 KB (AVIF) | 98% |
| `flat.png` 640×480 | 4.9 KB | 855 B (OxiPNG) | 82% |
| `plex-mono.woff2` | 14.4 KB | 12.9 KB (latin slice) | 10% |
| `site.css` | 455 B | 210 B | 53% |
| `app.js` | 731 B | 271 B | 62% |
| `page.html` | 974 B | 365 B | 62% |
| `logo.svg` | 1.0 KB | 366 B | 65% |
| the site fixture (12 files) | 17.7 KB | 16.3 KB | 8% |
| **20 photographs, end to end** | 3.4 MB | — | **11s / 23s / 80s** |

**Read these as smoke tests, not claims.** `photo.jpg` is a synthetic gradient
and AVIF smooths exactly that, so 98% is far above a real photograph. The font
fixture is already a Latin-only webfont, so splitting has nothing left to win —
subsetting it to one sentence gives 82%. The site fixture's 8% is dominated by a
14.7 KB WOFF2 that site mode leaves alone by default.

The 20-photo run is the Phase 1 exit criterion: 20 decodes and up to 300 encodes
across the worker pool, nothing skipped, zip intact. The three timings are
Chromium, WebKit and Firefox. Output is byte-identical in all three — Firefox is
simply much slower at compiling and running these WASM encoders.

---

## Law 3 in practice

Folder mode turns on one question: *may this file be renamed?* Only if **every**
reference to it resolves statically. A real run of the fixture site reports:

```
index.html        Left the name alone — renaming a page would change its address.
img/inline.png    Left the name alone — it is used from an inline style attribute.
img/scripted.png  Left the name alone — js/app.js mentions it, and scripts are
                  not rewritten.
index.html        Left "{{ asset_path }}/img/hero.png" as it is — the address is
                  built by a template placeholder.
css/site.css      Left "../img/absent.png" as it is — no file named
                  img/absent.png was in the folder you dropped in.
```

The script rule is deliberately blunt: a filename appearing anywhere in a script
pins the file. Over-refusing costs a cache hash; under-refusing costs a 404.

## Bugs found by building it

Each of these was invisible until something real ran against it.

1. **The HTML minifier erased every inline `style` attribute.** A declaration list
   is not a stylesheet, so Lightning CSS parsed it as empty and returned nothing.
2. **The verifier did not notice**, because a background image occupies no space.
   It now compares computed `background-image`, and a test names the bug.
3. **CSSO deleted a whole `@media` block** it was too old to parse. Removed
   entirely (ADR-020).
4. **`wawoff2` hangs in a browser** though it works in Node — a promise that never
   settles, which defeats "skip and warn" (ADR-014).
5. **SVGO's `preset-default` removes attributes**, and two of the overrides first
   written were no-ops against SVGO 4.
6. **The dev server was feeding tests the wrong input** — Vite rewrites `.css`,
   `.html` and `.svg` into JS modules, so the minifier was reading Vite's output.
7. **The verifier applied byte offsets to text those offsets did not describe**,
   and keyed the "after" side by original filenames while its addresses pointed at
   fingerprinted ones.
8. **`parseSrcset` split on every comma**; a URL may legally contain one.
9. **`setInputFiles` flattens folder structure**, which is why the folder tests
   build the drop the way a real directory pick does.
10. **A dropped folder silently did nothing in WebKit.** `webkitGetAsEntry()`
    returns an entry that looks readable and then rejects the read with
    `NotFoundError`. That rejection propagated out of ingest and aborted the
    entire drop — the user dropped files and the page just sat there. Ingest now
    skips an entry it cannot read and falls back to the plain file list if the
    walk yields nothing. Found only by running in a second engine.
11. **The verifier's "image stopped loading" check could never fire.** It asked
    `element instanceof HTMLImageElement` of elements inside an iframe, which
    belong to that frame's realm, so the answer was always false. Geometry caught
    most broken images anyway — but not one with a fixed width and height. It now
    checks the tag name, and a test breaks exactly that case.
12. **Expanding one snippet stretched the results table to 31,000px**, pushing
    the Copy button off-screen. A ThumbHash data URI is one long line and an
    auto-layout table sizes columns to it. The table is fixed-layout now.

## CI/CD

`.github/workflows/ci.yml`: **verify** (lint, typecheck, unit tests, build,
payload budget), **e2e** (Chromium), **deploy** (Cloudflare Pages, gated on both).

To make deploys live: set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as
repository secrets and create a Pages project named `pare` — then watch the first
run, because it has never happened.

## Decisions recorded

ADR-007 browser decode / WASM encode · ADR-008 metadata policy · ADR-009 savings
measured against the served file · ADR-010 two test tiers · ADR-011 splitting
default, subsetting opt-in · ADR-012 minifiers rewrite, never remove · ADR-013
named browser floors · ADR-014 `woff2-encoder` over `wawoff2` · ADR-015 splice,
never re-serialize · ADR-016 scanner discovers, DOMParser audits · ADR-017 verify
by layout, not pixels *(supersedes 006)* · ADR-018 no critical CSS · ADR-019 no
Core Web Vitals · ADR-020 no CSSO · ADR-021 site-mode `<picture>`, opt-in and
fenced · ADR-022 animated GIFs copied unchanged · ADR-023 offline after first
use · ADR-024 save only into an empty folder · ADR-025 visual direction and
motion language · ADR-026 HEIC and BMP · ADR-027 server templates and
WordPress · ADR-028 minification levels, maps and browser ranges · ADR-029 zip input · ADR-030
right-sized images · ADR-031 unused-CSS report · ADR-032 big images in parallel ·
ADR-033 each codec fetched once

---

## Before launch

- [x] Push to a remote and watch CI run — it runs; verify and browser jobs pass
- [x] Cloudflare Pages project `pare` exists (production branch `master`); first
      production deploy done by hand
- [ ] Set `CLOUDFLARE_API_TOKEN` and
      `CLOUDFLARE_ACCOUNT_ID`, then re-run the deploy job and read its log
- [x] Point `pare.devstash.me` at it (custom domain on the Pages project)
- [ ] Run folder mode against a real WordPress or static-site export
- [ ] Measure real savings on real photographs and a full multi-script font

## Known gaps

- **WebKit has no `OffscreenCanvas` in workers**, so every image decode there
  falls through to the WASM decoders rather than the browser's own. It works and
  the output is identical, but it costs a few hundred KB of extra download and is
  slower. That fallback is now exercised directly in all three engines
  (`codecs.spec.ts`). `AGENTS.md`'s "main-thread canvas" fallback is not built,
  because the decode runs in a worker where no such canvas exists.
- **Firefox is roughly 7× slower** through the image pipeline — 80s for twenty
  photographs against 11s in Chromium. Correctness is identical; it is WASM
  encode throughput, not a bug. Worth knowing before quoting timings.
- **Verification runs with scripts disabled**, so a JavaScript-assembled layout is
  compared in its pre-script state (ADR-017). Module bundling is therefore
  unverifiable and opt-in, and site-mode `<picture>` refuses any page whose
  scripts it cannot clear (ADR-021).
- **Site-mode `<picture>` is conservative by design.** One position-based image
  selector anywhere turns it off for the whole site, and one external script
  turns it off for that page. Expect it to refuse on many real themes; the
  warning list says exactly why each time.
- **The largest site tested is 40 generated pages** (`scale.spec.ts`: 13–20s in
  Chromium, 37–60s in WebKit, 91s in Firefox). Still no real theme with hundreds
  of assets. Run all three engines at once on one machine and the slower two time
  out; run them per engine, as CI does with one worker.
- **Memory is the ceiling for very large sites.** Inputs and outputs are all
  held in memory until the download. The zip no longer needs one archive-sized
  buffer, but streaming each file out as it finishes is still to do
  (`docs/SCALING.md`, section 2).
- **HEIC is not converted in whole-site mode** (ADR-026); use files mode.
- **Out-of-memory recovery is untested at real size.** A decode that fails is
  retried once, scaled to the largest ladder width during decode, then skipped
  (`ARCHITECTURE.md`). The scaled decode itself is tested; provoking a genuine
  out-of-memory in CI is not practical. WebKit has no scaled path and skips.
