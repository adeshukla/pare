# Project status

Updated: 2026-09-01

| | |
|---|---|
| **Phase 0 — Skeleton** | ✅ complete |
| **Phase 1 — Images** | ✅ complete, **not yet deployed** |
| **Phase 2 — Fonts** | ✅ complete |
| **Phase 3 — Text assets** | ✅ complete (CSSO rejected — ADR-020) |
| **Phase 4 — Folder mode** | ✅ complete (critical CSS not shipped — ADR-018) |
| **Phase 5 — Verification** | ✅ complete (web-vitals not shipped — ADR-019) |
| Live at | — **the deploy pipeline has never run.** See below. |
| Initial JS | **80.6 KB gzipped** of a 150 KB budget |
| Tests | 180 unit (Vitest) + 63 browser (Playwright), all passing |

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

**The deploy has never been exercised.** There is no git remote, so `ci.yml` has
never executed — not once. `cloudflare/wrangler-action@v3` is pinned on
assumption; the action version and the `pages deploy` invocation are both
unverified. "Just add the secrets" is optimistic: nobody has watched this
pipeline work.

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
| Site mode | re-encoded in place, same format | opt-in subset to the site's own characters (WOFF2 only) | minified in place, opt-in module bundling |

Every risky option is off by default and says why: font subsetting, module
bundling, and the deeper Terser pass.

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
| **20 photographs, end to end** | 3.4 MB | — | **11 seconds** |

**Read these as smoke tests, not claims.** `photo.jpg` is a synthetic gradient
and AVIF smooths exactly that, so 98% is far above a real photograph. The font
fixture is already a Latin-only webfont, so splitting has nothing left to win —
subsetting it to one sentence gives 82%. The site fixture's 8% is dominated by a
14.7 KB WOFF2 that site mode leaves alone by default.

The 20-photo run is the Phase 1 exit criterion, tested at last: 20 decodes and up
to 300 encodes across the worker pool, nothing skipped, zip intact.

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
Core Web Vitals · ADR-020 no CSSO

---

## Before launch

- [ ] Push to a remote and watch CI run once — the pipeline is untested
- [ ] Create the Cloudflare Pages project, set the two secrets
- [ ] Point `pare.devstash.me` at it
- [ ] Run folder mode against a real WordPress or static-site export
- [ ] Measure real savings on real photographs and a full multi-script font
- [ ] Try it in Firefox and Safari — everything so far is Chromium only

## Known gaps

- **Chromium only.** The browser-support matrix in `AGENTS.md` — AVIF fallbacks,
  `OffscreenCanvas`, the File System Access API — has never been exercised
  anywhere else. The ingest paths are now unit-tested and driven through the UI,
  but only in one engine.
- **Site mode does not emit `<picture>`.** Modern formats need `<source type=…>`,
  which reparents the `<img>` and can break `.gallery > img`. Site mode changes
  bytes, never markup — so a whole-site run gets in-place re-encoding (20–40%)
  rather than the AVIF win files mode delivers (70–90%). This is the largest
  remaining product gap, and it is a design decision rather than an oversight.
- **Verification runs with scripts disabled**, so a JavaScript-assembled layout is
  compared in its pre-script state (ADR-017). Module bundling is therefore
  unverifiable and opt-in.
- **Largest test site is 12 files.** Nothing has been run against a real theme
  with hundreds of assets; the verifier renders pages × 3 viewports serially and
  would be slow there.
- **OOM handling is a skip, not a retry.** `ARCHITECTURE.md` specifies
  downscale-retry-then-skip.
- **The WASM image-decode fallback is untested in CI** — it only runs when native
  decode fails, which Chromium never does for these formats.
- **Animated GIFs lose their animation.** First frame only; every GIF warns.
