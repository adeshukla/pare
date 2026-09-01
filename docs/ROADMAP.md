# Roadmap

Phases are ordered and gated. Don't start N+1 until N ships publicly.

> **Current deviation:** Phases 2 and 3 were built before Phase 1 was deployed, at
> the project owner's explicit direction. The gate is otherwise intact — Phase 4
> still must not ship without Phase 5. See `docs/STATUS.md`.
Each phase is independently launchable — there is never a half-finished product.

---

## Phase 0 — Skeleton ✅ **complete**
**~2 days**

- Vite + TS + React + Tailwind v4
- Comlink worker pool sized to `hardwareConcurrency - 1`
- Drop zone: File System Access API with `webkitGetAsEntry()` fallback
- File classification by magic bytes
- fflate zip output
- Deploy to Cloudflare Pages, `pare.devstash.me`

**Exit:** drop files, see them listed, download an unmodified zip. — met.
Deployment to Cloudflare Pages is wired in CI and waiting on account secrets;
see `docs/STATUS.md`.

---

## Phase 1 — Images ⭐ **public launch** ✅ **feature-complete, not yet deployed**
**~1.5 weeks**

- `@jsquash` decode: JPEG, PNG, WebP, AVIF, GIF first frame
- Resize ladder — default 400/800/1200/1600/2400, user-editable
- Encode AVIF + WebP + optimized original fallback
- Quality slider with live size preview per format
- EXIF stripping
- ThumbHash placeholders
- `<picture>` snippet with `srcset`, `sizes`, `width`, `height`, `loading`, `decoding`
- Savings report: per-file table + headline total

**Exit:** a stranger drops 20 photos, gets optimized files and working markup,
without reading instructions.

**Launch:** Show HN, r/webdev, Product Hunt. The before/after savings screenshot
is the post. Measure it on real photographs — the committed fixtures are
synthetic and flatter the encoder badly. See `docs/STATUS.md`.

---

## Phase 2 — Fonts ✅ **built**
**~1 week**

- Parse TTF/OTF/WOFF/WOFF2
- Codepoint detection from supplied HTML, CSS, or pasted text
- `hb-subset` subsetting
- WOFF2 output via `wawoff2`
- `@font-face` + `<link rel="preload">` snippet
- `unicode-range` splitting for multi-script fonts

**Exit:** a Google Fonts download shrinks 60%+ with correct rendering. — met;
`tests/e2e/fonts.spec.ts` asserts it against a real font. Note that splitting an
*already single-script* webfont saves far less; see ADR-011.

---

## Phase 3 — Text assets ✅ **built**
**~1 week**

- `lightningcss-wasm` — minify, autoprefix, transpile to a named browser floor
  (not a browserslist query — see ADR-013)
- `esbuild-wasm` minify; bundle only for `type="module"`
- `html-minifier-terser`
- `svgo`
- gzip via `CompressionStream`, brotli via `brotli-wasm`
- Optional deeper passes: `csso`, `terser`

**Exit:** all four text types minified with a visible per-type breakdown. — met.
Bundling `type="module"` graphs is deferred to Phase 4, which is where the asset
graph that identifies entry points actually gets built.

---

## Phase 4 — Folder mode
**~2 weeks**

- Entry HTML detection, full asset graph via `DOMParser`
- Reference resolvability marking (Law 3)
- Content hashing + rewriting for resolvable references only
- Warning list for everything skipped, in plain language
- Complete `dist/` output
- Critical CSS extraction at mobile viewport, inline + async rest

**Gate:** does not ship without Phase 5's verifier. This is the first phase that
can break a page.

---

## Phase 5 — Verification
**~1 week**

- Render before/after in iframes at the viewport matrix
- `pixelmatch` diff, flag anything over threshold
- `web-vitals` measurement in preview
- Per-page pass/fail before download is offered

---

## Later, unscheduled

- `pare` single binary CLI (Go/Rust), same core, for terminal users
- WASM file-converter siblings — PDF, video trim
- Coverage-based CSS purge as a **separate paid product** with a real crawler.
  Not part of Pare. See ADR-002.

---

## Not on the roadmap

See `docs/SCOPE.md` non-goals. Framework support, npm resolution, dev server,
accounts, Lighthouse scoring, CSS purging, SEO auditing. Adding any of these
requires superseding an ADR first.
