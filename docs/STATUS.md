# Project status

Updated: 2026-09-01

| | |
|---|---|
| **Phase 0 — Skeleton** | ✅ complete |
| **Phase 1 — Images** | ✅ complete, **not yet deployed** |
| **Phase 2 — Fonts** | ✅ built |
| **Phase 3 — Text assets** | ✅ built |
| **Phase 4 — Folder mode** | ✅ built, one item deferred (ADR-018) |
| **Phase 5 — Verification** | ✅ built, one item deferred (ADR-019) |
| Live at | — (deploy pipeline built, Cloudflare secrets not yet set) |
| Initial JS | **79.5 KB gzipped** of a 150 KB budget |
| Tests | 168 unit (Vitest) + 49 browser (Playwright), all passing |

> **Phases 2 through 5 were built ahead of the Phase 1 launch gate**, at the
> project owner's explicit direction. `AGENTS.md` says not to start phase N+1
> while N is incomplete, and `ROADMAP.md` gates phases on shipping publicly.
>
> The one gate that was **not** relaxed is the important one: Phase 4 is the first
> thing Pare does that can break a page, and the roadmap says it does not ship
> without Phase 5's verifier. That verifier is built, it runs on every folder-mode
> run, and the download button does not render until it comes back clean.

---

## What works today

**Files mode** — drop images, fonts and code; get optimized files plus the markup
to use them. Nothing is renamed and no markup is restructured; you paste the
snippets in yourself.

**Site mode** *(new)* — drop a whole folder; get a `dist/` back. Every asset is
replaced by a smaller version of itself in the same format, files whose every
reference could be traced are content-fingerprinted for caching, and every address
pointing at them is updated. Then both versions of every page are rendered and
compared, and the download is offered only if nothing moved.

| | Images | Fonts | CSS / JS / HTML / SVG |
|---|---|---|---|
| Files mode | AVIF + WebP + original, resize ladder, ThumbHash, `<picture>` | split by script or subset, WOFF2, `@font-face` | minify, prefix, gzip/brotli siblings |
| Site mode | re-encoded in place, same format | copied through | minified in place |

## Measured on the committed fixtures

Real numbers from the real pipeline in Chromium, default settings:

| | Before | After | Change |
|---|---|---|---|
| `photo.jpg` 1200×800 | 175.7 KB | 3.3 KB (AVIF) | 98% |
| `flat.png` 640×480 | 4.9 KB | 855 B (OxiPNG) | 82% |
| `plex-mono.woff2` | 14.4 KB | 12.9 KB (latin slice) | 10% |
| `site.css` | 455 B | 210 B | 53% |
| `app.js` | 731 B | 271 B | 62% |
| `page.html` | 974 B | 365 B | 62% |
| `logo.svg` | 1.0 KB | 366 B | 65% |
| **the site fixture** (10 files) | 17.7 KB | 16.3 KB | **8%** |

**Read these as a smoke test, not as a claim.**

- `photo.jpg` is a synthetic gradient; AVIF smooths exactly that, so 98% is far
  above a real photograph. The test asserts only 20–100%.
- The font is *already* a Latin-only webfont, so splitting has almost nothing left
  to win. Subsetting the same file to one sentence gives **82%**, which is what
  the 60% exit criterion is tested against (ADR-011).
- **The site's 8% is honest and low for a reason worth knowing**: 14.7 KB of that
  17.7 KB is a WOFF2, and site mode copies fonts through untouched. The HTML, CSS
  and JS in it shrank 40–60%; the font dominates the total. A real site, where
  images are most of the weight, looks nothing like this.

On that run: 10 files, 6 fingerprinted, 13 addresses updated, 6 files correctly
left alone, and verification passed across 2 pages × 3 viewports.

---

## Law 3 in practice

The whole of Phase 4 turns on one question: *may this file be renamed?* It may
only be renamed if **every** reference to it resolves statically. The site fixture
exercises each way that can fail, and the warning list from a real run reads:

```
index.html        Left the name alone — renaming a page would change its address.
about.html        Left the name alone — renaming a page would change its address.
img/inline.png    Left the name alone — it is used from an inline style attribute.
img/scripted.png  Left the name alone — js/app.js mentions it, and scripts are
                  not rewritten.
index.html        Left "{{ asset_path }}/img/hero.png" as it is — the address is
                  built by a template placeholder.
css/site.css      Left "../img/absent.png" as it is — no file named
                  img/absent.png was in the folder you dropped in.
```

The script rule is deliberately blunt: a filename appearing *anywhere* in a
script — literal, comment, lookup table — pins the file. Deciding what
`base + '/' + name` evaluates to is undecidable, which ADR-003 already settled. The
cost of over-refusing is a missed hash; the cost of under-refusing is a 404.

## Problems found and fixed while building Phases 4 and 5

1. **The HTML minifier was erasing every inline `style` attribute.**
   html-minifier-terser hands a style attribute's declaration list to the CSS
   minifier, but a declaration list is not a stylesheet: Lightning CSS parsed it
   as empty and returned nothing, so `style="background-image: url(…)"` became
   `style=""`. A silent deletion, which Law 2 forbids outright. Inline style
   attributes and `on*` handlers are now left alone.
2. **The verifier did not catch it.** A background image occupies no space, so
   nothing moved and the layout diff called the site clean. The verifier now also
   compares computed `background-image`, and a test names this bug.
3. **The verifier was handed byte offsets from the wrong text.** It received the
   caller's graph, built from the original files, and applied those offsets to
   minified-and-rewritten text — splicing mid-attribute. It now discovers
   references in whatever text it is actually given.
4. **The "after" side was keyed by original filenames** while its addresses
   pointed at fingerprinted ones, so every reference resolved to nothing and a
   clean site would have been reported as entirely broken.
5. **`parseSrcset` split on every comma.** A URL may legally contain one as long
   as it does not end with one, so `img/a,b.jpg 400w` was being torn in half.
   Replaced with the HTML spec's actual algorithm.
6. **`setInputFiles` flattens folder structure.** Playwright's helper produces
   files with no `webkitRelativePath`, so `css/site.css` arrived as `site.css` and
   no relative address resolved. The folder tests now build the drop the way a
   real directory pick does.

## Toolchain

| | Was | Now |
|---|---|---|
| Vite | 7.3.6 | **8.2.2** |
| Vitest | — | **4.1.11** |
| ESLint | — | **10.9.1** + typescript-eslint 8.69 |
| Playwright | — | **1.62.1** |
| TypeScript | 5.9.3 | **5.9.3** — held |

TypeScript 7.0.2 is released, but `typescript-eslint@8` declares
`typescript >=4.8.4 <6.1.0`. Taking TS 7 today means dropping type-aware linting.

## CI/CD

`.github/workflows/ci.yml`, three jobs: **verify** (lint, typecheck, unit tests
with coverage, build, payload budget), **e2e** (Chromium), **deploy** (Cloudflare
Pages, gated on both).

**To make deploys live**, set `CLOUDFLARE_API_TOKEN` (scoped to *Cloudflare Pages:
Edit*) and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, and create a Pages
project named `pare`.

## Decisions recorded

| | |
|---|---|
| ADR-007 | decode with the browser, encode with WASM |
| ADR-008 | strip identity metadata, keep rendering metadata |
| ADR-009 | savings measured against the file a browser downloads |
| ADR-010 | two test tiers, split on whether the browser is required |
| ADR-011 | splitting is the default; dropping glyphs is opt-in |
| ADR-012 | minifiers are configured to rewrite, never to remove |
| ADR-013 | named browser floors, not a browserslist query |
| ADR-014 | `woff2-encoder` rather than `wawoff2` |
| ADR-015 | rewrite by splicing byte ranges, never by re-serializing |
| ADR-016 | the scanner discovers, DOMParser audits |
| ADR-017 | verify by layout and resource loading, not by pixels *(supersedes 006)* |
| ADR-018 | critical CSS extraction is not shipped |
| ADR-019 | no Core Web Vitals number |

---

## Deliberately not shipped

Both are roadmap items. Both were skipped on principle rather than for time, and
both have an ADR arguing the case.

- **Critical CSS extraction** (Phase 4). Its benefit requires making the
  stylesheet non-render-blocking, which the verifier — running with scripts
  disabled by design — structurally cannot check. Shipping an unverifiable step
  inside the phase that is gated on verification is the wrong trade. ADR-018.
- **Core Web Vitals in the preview** (Phase 5). Measured from a blob URL on the
  optimizing machine, the number describes nothing about the user's host.
  Publishing it would be the performance claim Law 5 forbids. ADR-019.

## Before any of this can launch

- [ ] Create the Cloudflare Pages project and set the two secrets
- [ ] Point `pare.devstash.me` at it
- [ ] Measure real savings on real photographs and a full multi-script font
- [ ] Run folder mode against a real WordPress or static-site export
- [ ] Check a large image (12 MP+) for memory behaviour

## Known gaps

- **Site mode does not optimize fonts.** Subsetting produces several files or
  changes the container's extension, either of which means restructuring the
  `@font-face` rules rather than swapping an address. Files mode does it properly;
  site mode copies fonts through and says so.
- **Site mode does not emit `<picture>`.** Modern formats need `<source
  type=…>`, which reparents the `<img>` and can break a selector like
  `.gallery > img`. Site mode changes bytes, never markup. The `<picture>` route
  stays in files mode, where the user pastes it in knowingly.
- **Verification runs with scripts disabled.** That makes the comparison
  deterministic, but a JavaScript-assembled layout is compared in its pre-script
  state. ADR-017 states this limit.
- **OOM handling is a skip, not a retry.** `ARCHITECTURE.md` specifies
  downscale-retry-then-skip; only the skip half is implemented.
- **The WASM image-decode fallback is untested in CI.** It only runs when native
  decode fails, which Chromium never does for the formats in scope.
- **Animated GIFs lose their animation.** Only the first frame is read; every GIF
  warns.
- **JS bundling is not implemented.** Minification is complete for scripts and
  modules; bundling `type="module"` graphs was never started.
