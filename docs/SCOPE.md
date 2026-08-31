# Scope

## Who this is for

A developer with a folder of files and no build step. Concretely:

- Someone maintaining a static HTML/CSS/JS site
- A WordPress or PHP theme developer who needs optimized assets to paste into templates
- A student or hobbyist shipping via FTP or drag-drop hosting
- Anyone who has never installed Node and isn't going to

They are not looking for a build system. They want an optimized image and the
`<picture>` tag to paste in.

## The job to be done

> "Make my assets smaller and give me the code to use them, without installing anything
> and without breaking my site."

---

## In scope

### Phase 1 — Images
- Decode JPEG, PNG, WebP, AVIF, GIF (first frame)
- Resize to a breakpoint ladder
- Encode AVIF, WebP, MozJPEG, OxiPNG
- Strip EXIF and other metadata
- Emit `<picture>` / `srcset` / `sizes` snippet
- Emit `width` and `height` attributes to prevent layout shift
- ThumbHash placeholder generation

### Phase 2 — Fonts
- Detect used codepoints from supplied HTML/CSS/text
- Subset via HarfBuzz
- Convert to WOFF2
- Emit `@font-face` + `<link rel="preload">` snippet

### Phase 3 — Text assets
- Minify HTML, CSS, JS, SVG
- Autoprefix and transpile CSS to a browserslist target
- gzip and brotli sibling files

### Phase 4 — Folder mode
- Crawl an entry HTML file's asset graph
- Content-hash and rewrite resolvable references
- Output a complete `dist/`

### Phase 5 — Verification
- Render before/after in iframes, pixel-diff, flag regressions
- Core Web Vitals estimate in preview

---

## Explicit non-goals

Do not build these. Do not propose these. If you believe one is wrong, write an ADR.

| Non-goal | Why |
|---|---|
| **CSS purging / dead rule removal** | Cannot be made safe without a live-server crawl across a viewport × state matrix. Violates Law 2. See ADR-002. |
| **JS tree shaking of classic scripts** | Undecidable for global-scope scripts. Only meaningful for ESM, which this audience doesn't use. |
| Framework support (React, Vue, JSX, TS) | Those users already have a bundler. |
| npm / node_modules resolution | Requires a package registry and a resolver. Out of the browser's reach and off-mission. |
| Dev server, HMR, watch mode | Pare is a one-shot optimizer, not a workflow. |
| Accounts, saved projects, cloud sync | Requires a server. Violates Law 1. |
| Lighthouse scoring | Node-only, and invites performance claims we can't stand behind. |
| SEO or accessibility auditing | Different product. Scope discipline. |
| Video transcoding | Payload cost and runtime are both an order of magnitude off. Maybe a separate tool. |
| Anything phrased as "compliance" | Never make a compliance claim. |

---

## The safety contract

Pare's entire positioning rests on one sentence:

> **Pare cannot break your site.**

Every feature is measured against that. A feature that adds a 1% chance of a broken
page is worth less than the trust it costs, no matter how large the savings.

This is why CSS purging — the flashiest possible feature — is permanently out.
It offers 80–90% savings on 3–8% of page weight, in exchange for the one thing
that makes this tool different from every other optimizer.

## Where the bytes actually are

Priority follows real page composition, not feature glamour:

| Asset class | Share of page weight | Achievable savings | Risk |
|---|---|---|---|
| Images | 60–80% | 70–90% | none |
| Fonts | 5–15% | 60–80% | none |
| JS + CSS minify | 10–20% | 30–50% | near zero |
| Compression | — | 15–25% | none |

Images alone justify the tool. Everything else is additive.
