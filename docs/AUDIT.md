# Audit — 2026-10-13

Run against the live site (pare.devstash.me) and the code at `master`. Every
finding below was measured, not guessed; the "Fixed" column says what was done
in this pass.

## 1. Findings

| Area | Finding | Severity | Fixed |
|---|---|---|---|
| Dependencies | `npm audit`: 2 high (source-map-js via svgo/Tailwind, brace-expansion in dev tools). Not reachable with attacker data in Pare, but real | Medium | ✅ `npm audit fix` — 0 left |
| Downloads | Every worker fetched its own copy of each codec. Ten workers asking for the 3.4 MB AVIF encoder (or 14–16 MB esbuild / Lightning CSS) at once can mean ten downloads; a service worker does not merge in-flight requests. Measured with cache off: ~45 MB for one photo | High (on real networks) | ✅ First worker to need a codec fetches it alone; the rest wait only for that load, then hit the cache. No slowdown measured (20 photos: 7–8 s either way) |
| Accessibility (WCAG 2.2 AA, axe-core) | Light theme: savings badges 3.8–4.5:1 contrast; grey on code blocks 4.39:1; the "measuring…" chip faded to 70%. No `<h1>` once files are dropped; feature tiles skipped a heading level. Code snippets and the comparison scrolled but could not be reached by keyboard | High | ✅ All fixed; **0 violations** on landing, settings, files results and whole-site results, light and dark. Now a test in all three engines (`a11y.spec.ts`) |
| Search & sharing | `robots.txt`, `sitemap.xml` and any unknown URL returned the home page with **200** — search engines read HTML as the robots file and see "soft 404s". No share preview (no Open Graph / Twitter tags), no canonical URL | High for discovery | ✅ Real `robots.txt`, `sitemap.xml`, a `404.html` (real 404 status on Cloudflare), Open Graph + Twitter tags with a 1200×630 preview image, canonical link |
| Installable app | No web app manifest or app icons, so Pare could not be installed even though it already works offline | Medium | ✅ Manifest, 192/512 icons, maskable icon, Apple touch icon — all run through Pare itself (preview 206 → 43 KB, icons −60–80%) |
| Load speed | First visit: **127 KB** over the network, usable in **1.6 s** on slow 4G, LCP 1.2 s. Good | — | — |
| Security headers | COOP/COEP, `nosniff`, `no-referrer` present. **No Content-Security-Policy** and no HSTS | Medium | ✅ CSP and HSTS (ADR-040), tested under the shipped headers in Chromium, Firefox and WebKit |
| Deploys | Pushes to `master` do not deploy until the two Cloudflare secrets are set | Medium | ❌ Owner action (STATUS.md) |
| Mobile | Layout passes at phone width. But results come back as a **zip**, which phones handle badly, and there is no way to send a photo *to* Pare from the gallery | High for phone users | ✅ Save and Share per file, Pare in the Android share sheet (ADR-036) |

## 2. Who uses a tool like this, and what Pare covers

| Who | What they bring | Pare today |
|---|---|---|
| **Everyday people** — the largest group by far | A phone photo too big for a form, an email or a chat; an iPhone HEIC nothing opens; "make this under 100 KB"; "resize to 600×600" | HEIC ✅, resize ✅ (one size, crop), formats ✅ — but **no "under N KB" target**, the page talks like a developer tool, and results arrive as a zip |
| Bloggers, WordPress owners | A theme, or `wp-content/uploads` | ✅ Strong: zip in, whole-site mode, nothing renamed, theme header kept |
| Web developers without a build step | A static site folder | ✅ Strongest: right-sizing, AVIF/WebP, fingerprints, verified download |
| Designers | Logos and icons for a site; SVG; a favicon set | SVG ✅ — **no favicon / app-icon generator** |
| Developers with a build pipeline | Wants this in CI | ❌ Web only (CLI is the reserved next step) |

The gap is clear: Pare is excellent for the smaller, technical groups and
under-serves the biggest one.

## 3. Recommendations, in order

Every item keeps the Five Laws: no server, nothing semantic deleted, honest
numbers.

### P1 — reach most users (each small to medium)

1. **Target size: "make it under ___ KB".** The single most common image
   request on the web (forms, job and exam portals, email limits). Pare
   searches the quality setting (and, if needed, the size) until the file fits,
   and says exactly what it had to give up. Add one-click presets for common
   limits (20 KB, 50 KB, 100 KB, 200 KB, 1 MB).
2. **Task-first entry points.** Short, plain pages for what people search for —
   *HEIC to JPG*, *Compress a photo*, *Resize an image*, *PNG to WebP*,
   *Make a favicon* — each the same app with the right settings already chosen.
   Static pages, so they cost nothing and are what search engines send people to.
3. **Results that work on a phone.** On phones, offer *Save* per file and the
   system *Share* sheet (Web Share API) instead of only a zip; on Android, let
   Pare appear in the share sheet so a photo can be sent *to* it (Web Share
   Target, handled by the existing service worker).
4. **"Try it with a sample"** on the landing page, so someone without files to
   hand sees what Pare does in five seconds.
5. **Privacy shown, not just stated.** A small "location removed" mark on photos
   whose GPS data was stripped — a concrete reason to choose Pare over upload
   sites.

### P2 — deepen the existing audiences

6. **Favicon & app-icon set** from one image or SVG: `favicon.ico`, PNG sizes,
   Apple touch icon, maskable icon, `manifest.webmanifest`, and the `<link>`
   tags to paste — the snippet philosophy (ADR-004) applied to icons.
7. **Content-Security-Policy**, rolled out report-only first, tested against the
   verifier (its frames inherit the policy) and the codecs (WASM needs
   `wasm-unsafe-eval`). Turn on HSTS in Cloudflare.
8. **Width and height on `<img>`** in whole-site mode where missing — the
   attributes that stop a page jumping while images load. Adds attributes,
   removes nothing, and the verifier checks the result.
9. **More inputs:** JSON / XML / sitemap minify; TIFF in; animated GIF to
   animated WebP (needs an animation-capable encoder — check one runs in a
   browser first).
10. **Languages.** The UI is English only. Hindi, Spanish, Portuguese and
    Indonesian would reach the largest groups of people who need "compress my
    photo" most.

### P3 — new audiences

11. **CLI and GitHub Action** with the same engine (`pare ./site`), for teams
    with a build pipeline.
12. **A savings report to share** — a self-contained HTML page of before and
    after, for agencies to show clients.
13. **Copy diagnostic** button for bug reports: browser, settings, file types,
    warnings — never file contents. Support at scale without telemetry.

## 4. What I would build next

**All thirteen are built.**

| # | Item | Where |
|---|---|---|
| 1 | Under a size, with presets | ADR-034 |
| 2 | Task pages (six, including "Make a favicon") | ADR-035 |
| 3 | Save and Share per file; Pare in the Android share sheet | ADR-036 |
| 4 | "Try it with a sample photo" - runs straight away | `DropZone.tsx` |
| 5 | "Location removed" on photos whose GPS position is gone, checked on the output bytes | `metadata.ts` `hasGpsLocation` |
| 6 | Icon set from one picture | ADR-039 |
| 7 | Content-Security-Policy and HSTS | ADR-040 |
| 8 | Width and height on images, where trying them on moves nothing | ADR-037 |
| 9 | TIFF in; animated GIF to animated WebP; JSON and XML minified | ADR-038 |
| 10 | Hindi, Spanish, Portuguese, Indonesian on the everyday path | ADR-041 |
| 11 | Command line and GitHub Action | ADR-042 |
| 12 | Savings report, one self-contained HTML page | `share-report.ts` |
| 13 | "Copy details for a bug report", with no file names or contents | `diagnostic.ts` |

Still open: translating the advanced settings and whole-site mode. (The WebKit
"stall" found while testing item 7 was the build machine, not Pare - see
STATUS.md.)

**Target size (1), task pages (2) and phone results (3)** together. They turn
Pare from a developer tool into something anyone with a photo can use, and none
of them needs a server.
