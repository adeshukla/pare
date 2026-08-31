# Project status

Updated: 2026-09-01

| | |
|---|---|
| **Phase 0 — Skeleton** | ✅ complete |
| **Phase 1 — Images** | ✅ complete, not yet deployed |
| **Phase 2 — Fonts** | not started |
| Live at | — (deploy pipeline built, Cloudflare secrets not yet set) |
| Initial JS | **69.5 KB gzipped** of a 150 KB budget |
| Tests | 53 unit (Vitest) + 16 browser (Playwright), all passing |

---

## What works today

Drop images in, get optimized files and a `<picture>` tag out. End to end, in the
browser, with no network traffic after first load.

- Folder or file input, via File System Access API **and** `webkitGetAsEntry()`
- Classification by magic bytes, extension only as a fallback
- Decode JPEG, PNG, WebP, AVIF and the first frame of a GIF
- Resize ladder, default 400/800/1200/1600/2400, editable, never upscaling
- Encode AVIF, WebP, and an optimized original-format fallback
  (MozJPEG for JPEG sources, OxiPNG for PNG and GIF sources)
- Per-format quality sliders
- EXIF/XMP/comment stripping that keeps ICC profiles and refuses to rotate a photo
- ThumbHash placeholders, inlined into the snippet
- `<picture>` snippet with `srcset`, `sizes`, `width`, `height`, `loading`, `decoding`
- Per-file and total savings report, plus a `snippets.html` in the zip
- Progress per file, per format, per width — nothing runs silently

Every step has a toggle. Originals are never modified.

## Measured on the committed fixtures

Two files, default settings, run through the real pipeline in Chromium:

| File | Before | Served at full size | Change |
|---|---|---|---|
| `photo.jpg` 1200×800 | 175.7 KB | 3.3 KB (AVIF) | 98% smaller |
| `flat.png` 640×480 | 4.9 KB | 855 B (OxiPNG) | 82% smaller |

**Read these as a smoke test, not as a claim.** `photo.jpg` is a synthetic
gradient with added noise; AVIF smooths exactly that kind of content, so 98% is
far above what a real photograph gives. The end-to-end test asserts only that the
reduction lands above 20% and below 100%. Real numbers belong in the launch post,
measured on real photographs — see the Phase 1 launch note in `ROADMAP.md`.

---

## Review of the Phase 0 scaffold

Five issues found in the existing code. All are fixed.

1. **Progress callbacks would have thrown at runtime.** `App.tsx` passed a bare
   function through Comlink, which cannot structured-clone one. The first drop
   would have failed with `DataCloneError`. Callbacks now go through
   `Comlink.proxy`. *(`src/lib/optimize.ts`)*

2. **The budget check measured the wrong thing.** `check-budget.mjs` summed every
   `.js` in `dist/assets`, which counts lazily-loaded codec chunks against the
   initial-payload budget — so lazy-loading a 2 MB encoder made the number worse,
   exactly inverting the rule it enforces. It now walks the Vite manifest from the
   entry and follows static imports only, and separately fails if WASM ships with
   no deferred chunk to load it. *(`scripts/check-budget.mjs`)*

3. **A worker-pool waiter could be dropped.** `release()` freed the slot and then
   searched for a free one, so two concurrent releases could resolve the same slot
   twice and park a waiter forever. The slot is now handed directly to the next
   waiter. *(`src/lib/pool.ts`)*

4. **`.gitignore` covered four cases.** No coverage, test-results,
   playwright-report, `.env`, tool caches or editor directories. Rewritten.

5. **No CI, no lint, no tests.** All three added; see below.

## Toolchain

Upgraded to current majors, with one deliberate exception.

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

`.github/workflows/ci.yml`, three jobs:

- **verify** — lint, typecheck, unit tests with coverage, build, payload budget
- **e2e** — installs Chromium, runs the codec fixture tests and the app specs
- **deploy** — Cloudflare Pages, on push to `main`/`master`, gated on both above

`.github/dependabot.yml` groups weekly bumps so a codec update lands as one PR
through the same gates.

**To make deploys live**, set two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token scoped to *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID |

and create a Pages project named `pare`. Until then the deploy job fails and
nothing else depends on it.

`public/_headers` sets COOP/COEP so the AVIF and OxiPNG encoders can use their
multi-threaded builds. Safe because Pare loads nothing cross-origin.

## Decisions recorded this phase

- **ADR-007** decode with the browser, encode with WASM
- **ADR-008** strip identity metadata, keep rendering metadata
- **ADR-009** savings measured against the file a browser downloads
- **ADR-010** two test tiers, split on whether the browser is required

---

## Before Phase 1 can launch

Phase 1 is functionally complete. What remains is release work, not features.

- [ ] Create the Cloudflare Pages project and set the two secrets
- [ ] Point `pare.devstash.me` at it
- [ ] Measure real savings on real photographs for the launch post
- [ ] Check the pipeline against a large image (12 MP+) for memory behaviour —
      `docs/ARCHITECTURE.md` specifies downscale-retry-then-skip on OOM, and only
      the skip half is implemented
- [ ] Try a browser without native AVIF decode to exercise the WASM fallback path

## Known gaps

- **OOM handling is a skip, not a retry.** A very large image that exhausts memory
  is skipped with a warning. The specified behaviour is to downscale and retry once
  first.
- **The WASM decode fallback is untested in CI.** It only runs when native decode
  fails, which Chromium never does for the formats in scope.
- **Animated GIFs lose their animation.** Only the first frame is read. The run
  now warns on every GIF so this is never reported as a plain saving, but Pare
  cannot yet keep an animation.
- **`Asset.refs` and `Asset.resolvable` are unused.** They are Phase 4 machinery;
  ingest sets `resolvable: false` and nothing reads it. Nothing is renamed or
  hashed in Phase 1, so Law 3 is not yet in play.
