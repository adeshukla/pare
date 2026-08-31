---
name: pare
description: Mandatory project context, hard rules, and library assignments for Pare — a browser-based, client-side asset optimizer (images, fonts, minification) for developers with no build step. ALWAYS use this skill for any task touching the Pare codebase — writing or editing files in src/, workers/, optimizers/, or docs/; adding a dependency; designing a pipeline stage; generating HTML snippets; or discussing scope. Trigger on any mention of "Pare", "pare.devstash.me", or a client-side/WASM asset optimizer, even for small edits. It contains hard constraints (no server, never delete anything semantic, browser-only libraries) and settled decisions (CSS purging and tree shaking are permanently out of scope) that have already been argued through and must not be relitigated in code.
---

# Pare

Browser-based asset optimizer. Client-side only. No server, no upload, no account.

Before doing anything substantive, read `AGENTS.md` and `docs/SCOPE.md` from the
repo root. This skill is the summary; those are the contract.

## The Five Laws

1. **No server, ever.** Everything runs in the browser. Zero marginal cost per user
   is the business model — a backend kills the free tool.
2. **Never delete anything semantic.** Compress, convert, resize, rename. Never
   remove CSS rules, DOM nodes, JS exports, or attributes.
3. **Unresolvable reference means no rewrite.** Can't statically resolve where an
   asset is referenced from? Don't hash it, don't rename it. Warn and move on.
4. **Every destructive step is toggleable and reversible.** Originals untouched.
5. **Honest reporting only.** Bytes and codecs. Never a performance, SEO, or
   compliance claim.

## Settled decisions — do not reopen

| Decision | Why | ADR |
|---|---|---|
| Web app, not CLI or extension | Audience has no Node; extension is wrong container | 001 |
| **CSS purging permanently out** | Undecidable on server-rendered sites; needs a live crawl across viewport × state matrix; 3–8% of page weight for 100% of the trust | 002 |
| **No tree shaking of classic scripts** | Global scope makes it undecidable, not just unimplemented | 003 |
| Snippet output is first-class | A PHP dev can't use `dist/`; they need the `<picture>` tag | 004 |
| Images ship first, alone | 60–80% of page weight, zero breakage risk, complete product | 005 |

If you think one of these is wrong, write a superseding ADR in `docs/DECISIONS.md`.
Never work around one in code.

## Library assignments

Images `@jsquash/*` (avif, webp, jpeg, png, oxipng, resize) · heavy ops `wasm-vips`
(opt-in, ~10 MB) · SVG `svgo` · placeholders `thumbhash`
CSS `lightningcss-wasm` (+ optional `csso`) · targets `browserslist`
JS `esbuild-wasm` (+ optional `terser`)
HTML `DOMParser` **(native — never add parse5)** + `html-minifier-terser`
Fonts `harfbuzzjs`/`hb-subset` + `wawoff2`
gzip `CompressionStream` **(native)** · brotli `brotli-wasm`
Zip `fflate` **(not JSZip)** · Workers `comlink` **(never raw postMessage)**
Diff `pixelmatch` · vitals `web-vitals`

**Before adding any dependency, verify it runs in a browser.** sharp, Lighthouse,
critical, penthouse, and subset-font are Node-only and will not work here.

## Non-negotiable technical constraints

- Initial JS budget **150 KB gzipped**, enforced in CI. All WASM lazy-loaded on
  first use, never in the initial bundle.
- All WASM runs in workers. Zero main-thread blocking.
- No silent operation over 500 ms — always report progress.
- Ship both File System Access API and `webkitGetAsEntry()` drag-drop. Never gate a
  core feature behind a Chromium-only API.
- `Result` never throws. A failed optimizer returns input unchanged with a plain-
  language `skipped` reason. One bad file must never fail a run.

## Feature definition of done

Runs in a worker · reports progress · has a UI toggle · has a fixture test ·
fails by skipping and warning, never crashing · contributes to the savings report ·
emits its paste-ready snippet if it touches markup.

## Phase order

0 skeleton → **1 images (public launch)** → 2 fonts → 3 text minify →
4 folder mode → 5 verifier.

Phase 4 does not ship without Phase 5 — it's the first phase that can break a page.
Don't start a phase before the previous one is live.

## Voice

User-facing copy is plain language, no jargon. Errors explain what happened and what
Pare did about it: not "ENOENT," but "Couldn't read hero.jpg — the file may be
corrupted. It was copied unchanged."

Never claim Pare makes a site fast, compliant, or optimized. Report the bytes.
