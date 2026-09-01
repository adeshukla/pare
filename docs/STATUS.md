# Project status

Updated: 2026-09-01

| | |
|---|---|
| **Phase 0 — Skeleton** | ✅ complete |
| **Phase 1 — Images** | ✅ complete, **not yet deployed** |
| **Phase 2 — Fonts** | ✅ built |
| **Phase 3 — Text assets** | ✅ built |
| **Phase 4 — Folder mode** | not started (gated on Phase 5) |
| Live at | — (deploy pipeline built, Cloudflare secrets not yet set) |
| Initial JS | **72.1 KB gzipped** of a 150 KB budget |
| Tests | 106 unit (Vitest) + 39 browser (Playwright), all passing |

> **Phases 2 and 3 were built ahead of the Phase 1 launch gate**, at the project
> owner's explicit direction. `AGENTS.md` says not to start phase N+1 while N is
> incomplete, and `ROADMAP.md` gates phases on shipping publicly; Phase 1 is
> feature-complete but not deployed. Nothing else about the gate has moved —
> Phase 4 still must not ship without Phase 5's verifier, because it is the first
> phase that can break a page.

---

## What works today

Drop images, fonts and code in; get optimized files and the markup to use them.
End to end, in the browser, with no network traffic after first load.

**Images** — decode JPEG/PNG/WebP/AVIF and the first GIF frame · resize ladder
that never upscales · AVIF + WebP + optimized original · per-format quality ·
EXIF stripping that keeps ICC profiles · ThumbHash placeholders · `<picture>`
snippet with `srcset`, `sizes`, `width`, `height`, `loading`

**Fonts** — TTF/OTF/WOFF/WOFF2 in · WOFF2 out · split by Unicode range (lossless,
default) or subset to characters actually used (opt-in, warns) · `@font-face` and
`<link rel=preload>` snippet with `unicode-range` · family, weight and slant read
from the font's own tables

**Code** — CSS via Lightning CSS · JS via esbuild · HTML via html-minifier-terser ·
SVG via SVGO · gzip siblings natively, brotli on request · per-type breakdown in
the report

Every step has a toggle, controls appear only for the kinds of file dropped in,
and originals are never modified.

## Measured on the committed fixtures

Real numbers from the real pipeline in Chromium, default settings:

| File | Before | After | Change |
|---|---|---|---|
| `photo.jpg` 1200×800 | 175.7 KB | 3.3 KB (AVIF) | 98% |
| `flat.png` 640×480 | 4.9 KB | 855 B (OxiPNG) | 82% |
| `plex-mono.woff2` | 14.4 KB | 12.9 KB (latin slice) | 10% |
| `site.css` | 455 B | 210 B (minified + gzip) | 53% |
| `app.js` | 731 B | 271 B | 62% |
| `page.html` | 974 B | 365 B | 62% |
| `logo.svg` | 1.0 KB | 366 B | 65% |

**Read these as a smoke test, not as a claim.**

- `photo.jpg` is a synthetic gradient. AVIF smooths exactly that kind of content,
  so 98% is far above what a real photograph gives. The test only asserts the
  reduction lands between 20% and 100%.
- **The 10% on the font is honest and worth understanding.** That fixture is
  already a Latin-only webfont, so splitting it by script has almost nothing left
  to win. On a full multi-script font — what you get from the Google Fonts
  download button — splitting is dramatic. Subsetting the same fixture to the
  characters of one sentence gives **82%**, which is what the 60% exit criterion
  in `ROADMAP.md` is tested against. See ADR-011.
- The text figures are the honest shape of the win, on genuinely small files.

---

## Review of the Phase 0 scaffold

Five issues found in the original scaffold. All fixed.

1. **Progress callbacks would have thrown at runtime.** A bare function was passed
   through Comlink, which cannot structured-clone one; the first drop would have
   failed with `DataCloneError`. Now proxied.
2. **The budget check enforced the opposite of its own rule.** It summed every
   `.js` in `dist/assets`, counting lazy codec chunks against the *initial* payload
   budget — so lazy-loading a 2 MB encoder made the number worse. It now walks the
   Vite manifest from the entry, following static imports only.
3. **The worker pool could park a waiter forever** when two slots were released
   concurrently.
4. **`.gitignore` covered four cases.** Rewritten.
5. **No CI, no lint, no tests.** All three added.

## Problems found and fixed while building Phases 2 and 3

Recorded because each was invisible until something real was run against it.

1. **`wawoff2` hangs in a browser.** It works in Node, which is how it got chosen.
   Its Emscripten wrapper waits on an `onRuntimeInitialized` callback that never
   fires under Vite's CommonJS interop, so `compress` never settles. A hang defeats
   Law 5 entirely — "skip and warn" needs the failure to *return*. Replaced with
   `woff2-encoder`; the font suite went from five timeouts to six passes.
   (ADR-014.)
2. **SVGO's `preset-default` removes attributes.** `removeEmptyAttrs` and
   `removeDeprecatedAttrs` are both in it, and Law 2 names dropping attributes
   explicitly. Two of the overrides originally written were also no-ops —
   `removeViewBox` and `removeTitle` are not in SVGO 4's preset at all, and SVGO
   said so on stderr. Config corrected; tests assert the survivors either way.
   (ADR-012.)
3. **The dev server was feeding the tests the wrong input.** Vite rewrites `.css`,
   `.html` and `.svg` requests into JavaScript modules, so a test that fetched a
   fixture was handing Vite's output to the minifier, not the fixture. It surfaced
   as Lightning CSS returning an empty string. Text fixtures are now read in Node
   and passed into the page.
4. **`esbuild-wasm`'s package root resolves to the Node build**, which has no
   `initialize`. The browser ESM entry has to be named explicitly.
5. **Vite's dependency discovery reloaded the page mid-test**, tearing down
   whatever was mid-encode. Fixed at the root: WASM packages are excluded from
   pre-bundling, the two CommonJS ones are pinned into it.
6. **`fromText` reported a space that was not in the source** — a separator used
   when concatenating expanded escapes. Harmless in practice, wrong in principle
   for a function whose whole job is "which characters are in this file".

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
Revisit when typescript-eslint ships TS 7 support.

## CI/CD

`.github/workflows/ci.yml`, three jobs: **verify** (lint, typecheck, unit tests
with coverage, build, payload budget), **e2e** (Chromium, the codec and app
suites), **deploy** (Cloudflare Pages, gated on both).

**To make deploys live**, set `CLOUDFLARE_API_TOKEN` (scoped to *Cloudflare Pages:
Edit*) and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, and create a Pages
project named `pare`. Until then the deploy job fails and nothing depends on it.

Two lint rules exist to protect the payload budget from the editor rather than
from CI: static imports of any codec package are an error outside
`src/workers/*-codecs.ts` (type-only imports are allowed, since they are erased),
and `process` is a restricted global.

## Decisions recorded

- **ADR-007** decode with the browser, encode with WASM
- **ADR-008** strip identity metadata, keep rendering metadata
- **ADR-009** savings measured against the file a browser downloads
- **ADR-010** two test tiers, split on whether the browser is required
- **ADR-011** splitting is the default; dropping glyphs is opt-in
- **ADR-012** minifiers are configured to rewrite, never to remove
- **ADR-013** named browser floors, not a browserslist query
- **ADR-014** `woff2-encoder` rather than `wawoff2`

---

## Before any of this can launch

- [ ] Create the Cloudflare Pages project and set the two secrets
- [ ] Point `pare.devstash.me` at it
- [ ] Measure real savings on real photographs and a full multi-script font
- [ ] Check a large image (12 MP+) for memory behaviour
- [ ] Try a browser without native AVIF decode to exercise the WASM fallback

## Known gaps

- **OOM handling is a skip, not a retry.** `ARCHITECTURE.md` specifies
  downscale-retry-then-skip; only the skip half is implemented.
- **The WASM image-decode fallback is untested in CI.** It only runs when native
  decode fails, which Chromium never does for the formats in scope.
- **Animated GIFs lose their animation.** Only the first frame is read. Every GIF
  now warns, so it is never reported as a plain saving, but the animation is gone.
- **JS bundling is not implemented.** `ROADMAP.md` scopes bundling to
  `type="module"` graphs; identifying entry points needs the asset graph that
  Phase 4 builds. Minification is complete for both scripts and modules.
- **Variable fonts are subset but not instanced.** `hb-subset` can pin axes; Pare
  does not expose that, so a variable font keeps its full axis range.
- **`Asset.refs` and `Asset.resolvable` are still unused.** Phase 4 machinery.
  Nothing is renamed or hashed yet, so Law 3 is not in play.
