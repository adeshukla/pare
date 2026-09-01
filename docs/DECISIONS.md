# Decisions

Format: one ADR per architectural choice. Status is `accepted`, `superseded`, or `proposed`.
Never edit an accepted ADR — supersede it with a new one.

---

## ADR-001 — Browser web app, not a CLI or extension

**Status:** accepted

**Context.** The target user has no Node and no terminal comfort. Parcel already
solves the technical problem well; it fails this audience purely on install friction.

**Decision.** Ship a static web page. Not an npm CLI, not a Chrome extension.

**Reasoning.**
- An npm CLI reaches only people who already have Node — i.e. not the audience.
- An extension is the wrong container: files live on disk, not on a page; MV3's CSP
  makes WASM painful; Web Store review adds friction for a dev tool.
- A web page with the File System Access API does everything an extension would,
  with zero install.

**Consequence.** Every library must run in a browser. Rules out sharp, Lighthouse,
critical, penthouse, subset-font, and most of the standard toolchain.

---

## ADR-002 — CSS purging is permanently out of scope

**Status:** accepted

**Context.** Dead CSS removal is the flashiest possible feature. It was in the
original plan and was cut after analysis.

**Decision.** Pare never removes CSS rules.

**Reasoning.**

Static purging cannot be made safe on the sites that need it most. On a
server-rendered site the HTML doesn't exist on disk:

```php
<div class="alert alert-<?php echo $type; ?>">
<div class="<?php the_field('bg-color'); ?>">
```

Class names come from databases, WYSIWYG content, admin settings, conditional
includes, and runtime JS. They cannot be enumerated from a folder. This is a
documented, unsolved failure in PurgeCSS and every tool built on it.

Runtime coverage collection would be correct, but requires a headless browser
crawling a live URL across a matrix of viewports (360/768/1024/1440/1920) and
states (logged in/out, cart empty/full, form errors, 404, every modal and dropdown
opened). Miss one cell and you ship a broken state nobody sees until a customer
hits it. That needs a server, which violates Law 1, and it can break sites, which
violates Law 2.

The economics also don't favour it: CSS is 3–8% of typical page weight. Purging
offers 80–90% of that slice in exchange for the tool's entire trust position.

**Alternatives considered.**
- Static scan with safelist — still breaks on concatenated class names.
- Coverage crawl — correct, but needs a server. Viable as a *separate paid product*.
- Off-by-default toggle — rejected. A dangerous default that's off is still a
  dangerous default, and the marketing would still promise it.

**Consequence.** The savings ceiling is lower. Accepted. Images and fonts are
70–95% of the real prize anyway.

---

## ADR-003 — No tree shaking of classic scripts

**Status:** accepted

**Context.** "Tree shaking" was in the original pitch.

**Decision.** Bundle and tree-shake only for `<script type="module">`. Classic
scripts get concatenated in DOM order and minified, nothing more.

**Reasoning.** Classic scripts share one global scope. Proving `window.somePlugin`
is unreferenced is undecidable — any string anywhere could reach it. This is not a
tooling gap, it's a property of the language. Advertising tree shaking to an
audience that writes `<script src="jquery.min.js">` is a false promise.

---

## ADR-004 — Snippet output is a first-class deliverable

**Status:** accepted

**Context.** A `dist/` folder is useless to a WordPress or PHP developer. They can't
drop it into their site; they need markup to paste into a template.

**Decision.** Every markup-affecting optimizer emits paste-ready HTML alongside the
optimized files. Snippets are as prominent in the UI as the download button.

**Consequence.** This is the single biggest UX differentiator over Parcel and it
should shape the interface, not sit in a details panel.

---

## ADR-005 — Ship images first, alone

**Status:** accepted

**Context.** Full v1 scope is six feature areas. Temptation is to ship them together.

**Decision.** Phase 1 is images only, and it is a complete, launchable product.

**Reasoning.** Images are 60–80% of page weight and carry zero risk of breaking
anything. TinyPNG has millions of users doing less, and it uploads your files.
"Your images never leave your browser" is a complete pitch on its own. Every later
phase is additive, so there is never a half-finished state.

---

## ADR-006 — Visual diff verifier before any risky operation

**Status:** superseded by ADR-017

**Context.** Phase 4 introduces reference rewriting, the first operation that can
break a page.

**Proposal.** Before folder mode ships, build the iframe render + pixelmatch diff.
No rewriting operation ships without it.

**Open question.** Cross-origin iframe rendering of local blobs — needs a spike.

---

## ADR-007 — Decode with the browser, encode with WASM

**Status:** accepted

**Context.** `docs/ARCHITECTURE.md` assigns every image codec slot to `@jsquash`.
Phase 1 implementation surfaced that this is the right answer for encoding and the
wrong one for decoding.

**Decision.** Decode with `createImageBitmap` + `OffscreenCanvas`, falling back to
the `@jsquash` decoders when the browser refuses. Encode exclusively with
`@jsquash` — AVIF, WebP, MozJPEG, OxiPNG.

**Reasoning.**
- AGENTS.md already says to prefer a native browser API where one exists. The
  browser decodes every format Phase 1 accepts, including the first frame of an
  animated GIF, for zero bytes of payload. The `avif_dec` module alone is 344 KB
  gzipped that most users would never need.
- `imageOrientation: 'from-image'` bakes EXIF rotation into the pixels during
  decode. That is what makes it safe to drop EXIF afterwards — see ADR-008.
- Encoding is the opposite case. Canvas `convertToBlob` gives no quality control
  worth the name, no AVIF support to rely on, and no MozJPEG or OxiPNG at all.
- Keeping the WASM decoders as a fallback means AVIF and WebP sources still work
  on a browser that cannot read them natively, at the cost of a lazy chunk that is
  only fetched when native decode has already failed.

**Consequence.** Two decode paths to keep working. The Playwright suite exercises
the native path; the fallback is only reachable on browsers we cannot run in CI,
so it is structurally simple on purpose.

---

## ADR-008 — Strip identity metadata, keep rendering metadata

**Status:** accepted

**Context.** `docs/SCOPE.md` lists "strip EXIF and other metadata" in Phase 1.
"Metadata" turns out to name two very different things.

**Decision.**

| Removed | Kept |
|---|---|
| EXIF, XMP, IPTC, Photoshop resources, JPEG comments, PNG `tEXt`/`iTXt`/`zTXt`/`eXIf`/`tIME` | ICC profiles (`APP2 ICC_PROFILE`, PNG `iCCP`), `gAMA`, `cHRM`, `sRGB` |

And one refusal: a JPEG whose EXIF Orientation is not 1 is **not stripped at all**
when it is being passed through untouched. The reason is reported to the user.

**Reasoning.** Law 2 forbids removing anything semantic. Camera make, GPS and
timestamps change nothing on screen. Colour profiles do — dropping an ICC profile
shifts every colour in the image, which is precisely the silent visual regression
Law 2 exists to prevent. Orientation is the sharpest case: strip it from a
passed-through file and the photo appears on its side.

Files that go through the encoder do not hit the refusal, because decoding applies
the rotation to the pixels first (ADR-007). Only the passthrough path — where
re-encoding would have made the file bigger — can encounter it.

**Consequence.** Metadata stripping saves less than a strip-everything approach.
It also cannot rotate a photograph, which is worth more.

---

## ADR-009 — Savings are measured against the file a browser downloads

**Status:** accepted

**Context.** One source image produces up to fifteen output files: five widths
across AVIF, WebP and a fallback. There is no single obvious "after" number, and
the choice is very easy to make dishonestly.

**Decision.** The headline compares the original file against **the smallest
full-width variant** — the one a modern browser actually fetches at full size. The
total bytes of everything emitted is shown separately and labelled as the download
size.

**Reasoning.** Two tempting alternatives are both misreporting:
- Summing every output looks like the tool made things *worse*, which is false —
  nobody downloads fifteen files.
- Quoting the smallest thumbnail would show a 99% saving for a number nobody
  experiences. That is the kind of claim Law 5 exists to forbid.

Comparing like with like — full size against full size — is the only figure that
answers the user's actual question.

**Consequence.** The reported percentage is lower than competitors quote. That is
the intended trade. The report says in words what was measured, so the number can
be checked.

---

## ADR-010 — Two test tiers, split on whether the browser is required

**Status:** accepted

**Context.** AGENTS.md requires a fixture test per optimizer proving output is
decodable and smaller. The codecs are WASM built for the browser, and the ones
Pare uses need `createImageBitmap`, `OffscreenCanvas` and a real WASM host.
Running them under Node would mean testing a configuration nobody ships.

**Decision.**
- **Vitest, Node environment** — everything that is pure logic: classification,
  the resize ladder, metadata stripping, snippet generation, naming, the savings
  arithmetic, zip assembly. Fast, run on every commit.
- **Playwright, Chromium** — the codecs themselves and the whole user path. Each
  encoder is driven directly against a real fixture and its output decoded back to
  prove it is valid; the app specs walk drop → optimize → snippet → zip.

Fixtures are committed binaries, not generated at test time, so a codec change
cannot silently change what it is being tested against.

**Reasoning.** The split falls exactly on "does this need a browser". Mocking the
codecs to run them in Node would test the mock. Running everything in Playwright
would make the fast feedback loop slow for logic that has no browser dependency.

**Consequence.** Two runners and two commands. CI runs them as separate jobs, so a
logic regression is reported in under a minute without waiting on WASM.

---

## ADR-011 — Splitting is the default; dropping glyphs is opt-in

**Status:** accepted

**Context.** Phase 2 subsets fonts. Subsetting removes glyphs, and Law 2 says Pare
does not remove things. The tension is real and had to be resolved before any of
this shipped.

The failure mode is the one ADR-002 already rejected for CSS. A static scan of the
files a user drops in cannot see text that arrives from a database, a form, a
translation file, or JavaScript. Subset a font to the characters visible in one
folder of HTML and a page that later renders `Ł` or `ā` shows a tofu box — and
nobody notices until a customer does.

**Decision.** Two modes, and the safe one is the default.

| Mode | What it does | Risk |
|---|---|---|
| **Split by script** (default) | One file per Unicode range, each with a `unicode-range` descriptor. No glyph is removed from the set. | none |
| **Keep only characters I use** | Genuinely drops glyphs, based on scanned text plus anything pasted in. | real, and stated in the UI |
| Keep everything | Repack as WOFF2, nothing else. | none |

Splitting is lossless by construction: every codepoint the font could draw is in
exactly one output file, including anything the named ranges miss, which lands in
a leftover bucket. The browser downloads only the ranges a page uses, so a page in
English never fetches the Cyrillic file — and a page in Russian still renders.

The lossy mode carries a safety floor (printable ASCII is always kept, whatever
the scan found) and always emits a warning naming how many characters were
dropped. It is never selected for the user.

**Reasoning.** The two modes differ in kind, not degree. Splitting changes *when*
bytes are fetched; subsetting changes *whether the glyph exists*. Only the second
can break a page, so only the second needs the user to choose it knowingly.

**Consequence.** The default saves less than the tool could. On a font that is
already a single-script webfont — the common case if the user downloaded from
Google Fonts' CSS API — splitting saves very little, because there is nothing to
split. The measured figure on such a font is around 10%. That is the honest
number, and it is reported as such rather than quietly switching to the lossy
mode to make the headline look better.

---

## ADR-012 — Minifiers are configured to rewrite, never to remove

**Status:** accepted

**Context.** Phase 3 runs four third-party minifiers. Every one of them ships
defaults that delete things, because every one of them was built for a project
that controls its whole codebase. Pare is not that; it optimizes files for a site
it cannot see.

**Decision.** Each tool is turned down to transformations that cannot change what
renders or what script can reach. The deviations from each library's defaults:

**HTML** (`html-minifier-terser`). Whitespace is collapsed *conservatively* —
runs become one space, never nothing, because deleting the gap between `</em>` and
`<strong>` visibly joins two words. Comments go. Every attribute stays:
`removeEmptyAttributes`, `removeRedundantAttributes`, `collapseBooleanAttributes`,
`removeAttributeQuotes` and `removeOptionalTags` are all off. Law 2 names dropping
attributes explicitly, and `alt=""` is not noise.

**SVG** (`svgo`). Off: `removeEmptyAttrs` and `removeDeprecatedAttrs` (attributes),
`cleanupIds` and `removeUselessDefs` (another document can reach an id through
`<use href="logo.svg#id">`), `removeHiddenElems` and `removeEmptyContainers`
(script reverses both states), `removeUselessStrokeAndFill` and
`removeUnknownsAndDefaults` (an external stylesheet SVGO cannot see may depend on
them), `inlineStyles` (moving rules onto elements changes specificity, so a rule
in the page's own stylesheet can stop winning).

**CSS** (`lightningcss-wasm`). Minify and prefix only. `unusedSymbols` — Lightning's
dead-rule remover — is exactly the feature ADR-002 rules out permanently, and it
stays off.

**JavaScript** (`esbuild-wasm`). Identifier mangling is enabled only for files that
use `import`/`export`. A classic script's top-level names are globals, reachable
from another script, an inline handler, or a string passed to `setTimeout`;
renaming them is undecidable for the same reason ADR-003 rejected tree shaking
them. Modules have real scope, so there it is safe.

**Reasoning.** The savings that come from deleting are small and the trust cost is
total. Minification without deletion still returns 50–65% on real files, measured;
that is the whole prize, and it comes with no chance of breaking a page.

**Consequence.** Pare's minified output is slightly larger than a maximally
aggressive tool's. Every test in `tests/e2e/text.spec.ts` asserting that a rule, an
attribute or a global survived is what holds this decision in place.

---

## ADR-013 — Named browser floors, not a browserslist query

**Status:** accepted

**Context.** `docs/ARCHITECTURE.md` assigns `browserslist` to feed target versions
to Lightning CSS and esbuild.

**Decision.** Ship two named presets with explicit minimum versions instead.

**Reasoning.** `browserslist` resolves a query by reading configuration files from
disk and consulting the caniuse database. Neither of those exists in a browser tab.
Beyond the mechanics, a query like `> 0.5%` is opaque: the user cannot tell what it
resolved to, and it silently changes meaning as the underlying data updates.
"Modern browsers" and "Older browsers too", each pinned to stated versions, is
something a user can check.

**Consequence.** No custom queries. If a user needs a specific floor, they need a
version of this that takes one — a smaller feature than vendoring a resolver.

---

## ADR-014 — `woff2-encoder` rather than `wawoff2`

**Status:** accepted, supersedes the WOFF2 row of the table in ARCHITECTURE.md

**Context.** `docs/ARCHITECTURE.md` assigns `wawoff2` for WOFF2 compression.

**Decision.** Use `woff2-encoder`.

**Reasoning.** `wawoff2` works correctly in Node — it round-tripped the test
fixture there before any browser code existed. In a browser it hangs. Its wrapper
builds a promise from the Emscripten module's `onRuntimeInitialized` callback; under
Vite's CommonJS interop that callback never fires, and `compress` waits on it
forever.

A hang is worse than a crash. Law 5's "skip this file and warn" only works if the
failure returns; a promise that never settles takes the pool slot with it and the
run simply stops, with no message the user can act on.

`woff2-encoder` is the same Google WOFF2 codec compiled to WASM, published as ESM
with a promise API and no CommonJS in the path. It replaced wawoff2 in one function
and the font suite went from five timeouts to six passes in six seconds.

**Consequence.** `wawoff2` is removed from the dependencies. The library table in
ARCHITECTURE.md is stale on this row; this ADR is the current answer.

---

## ADR-015 — Rewrite by splicing byte ranges, never by re-serializing

**Status:** accepted

**Context.** Folder mode changes addresses inside HTML and CSS. The obvious way to
do that is to parse with `DOMParser`, change the attribute, and serialize the
document back out.

**Decision.** Find the exact byte range of the address and splice the replacement
into the original text. Never re-emit a whole file.

**Reasoning.** Serializing a parsed document rewrites the entire file, not the
part that changed. `DOMParser` normalises attribute quoting and casing, closes
tags the author left open, moves stray elements into `<body>`, drops a doctype's
internal subset, and re-encodes entities. Some of that is cosmetic. Some of it —
relocating an element out of `<head>`, for instance — changes what renders. All of
it is a change to a file nobody asked us to touch, which is Law 2 territory even
where it happens to be harmless.

Lightning CSS could re-emit stylesheets and would do it well, but the same
argument applies: minification is a thing the user switched on, and rewriting an
address is not.

There is a second benefit, and it turned out to matter more than expected. When
the only difference between input and output is the addresses, the Phase 5
verifier has a sharp question to ask: *did anything move?* If the answer is ever
yes, it is a real finding rather than noise from a reformat.

**Consequence.** A small positional scanner (`src/lib/html-scan.ts`,
`src/lib/css-refs.ts`) instead of leaning on a parser. It handles comments,
raw-text elements, all three attribute quoting styles, and CSS strings; it is not
a full HTML parser and does not try to be. ADR-016 covers what happens when it and
a real parser disagree.

---

## ADR-016 — The scanner discovers, DOMParser audits

**Status:** accepted

**Context.** `docs/ARCHITECTURE.md` assigns `DOMParser` to HTML parsing, and
AGENTS.md says never to add parse5 because the browser already has one. But
rewriting needs byte offsets, and `DOMParser` does not expose them (ADR-015).

**Decision.** The positional scanner finds references and their offsets.
`DOMParser` then reads the same page and reports any URL-bearing attribute the
scanner did not find. The audit can only **remove** a file's permission to be
renamed, never grant it.

**Reasoning.** Both tools are right about different things. The scanner sees the
bytes as written, including attributes a parser discards — a duplicate `src`, an
element in a position the parser relocates. `DOMParser` sees the page as a browser
will actually build it. Where they agree, the reference is understood. Where they
disagree, something about the markup is unusual enough that we do not know enough
to move the file, and the safe response is to leave it alone.

Making the audit one-directional is what keeps this honest. A disagreement can
only ever cost a cache-busting hash.

**Consequence.** The Law 3 logic stays pure and testable in Node, where the suite
runs in under a second — worth a great deal for the code most likely to break
someone's site. The audit runs in a worker, where `DOMParser` exists.

---

## ADR-017 — Verify by layout and resource loading, not by pixels

**Status:** accepted, supersedes ADR-006

**Context.** ADR-006 proposed rendering before and after in iframes and diffing
them with `pixelmatch`, and left an open question: how to render local files with
no server. Phase 5 had to answer both.

**Decision.** Render both versions from `blob:` URLs and compare the **geometry of
every element**, whether every image and stylesheet **loaded**, and whether any
**background image stopped painting** — at 360, 768 and 1280 pixels. No pixel
diff.

**Reasoning.**

*The open question, answered.* Every reference is rewritten to a blob URL and the
page is loaded from one. Blob URLs minted by a page are same-origin with it, so
`contentDocument` is readable. Stylesheets have to be minted before the pages that
link them, or their own `url()`s resolve against a blob URL with no path.

*Why not pixels.* A browser cannot screenshot an iframe — there is no API. The
usual workaround, serializing into an SVG `foreignObject` and drawing that to a
canvas, does not run scripts, taints the canvas, and silently drops any resource
it could not inline. A pixel diff built on it would report differences that are
artefacts of the capture, which is worse than no diff at all: it teaches the user
to ignore the verifier.

*Why geometry is the right question anyway.* Folder mode's failure mode is
specific — a reference that no longer resolves. That shows up as an image with
`naturalWidth === 0`, a stylesheet with no rules, or a box in the wrong place.
Measuring those directly is more precise than inferring them from pixels.

**Consequence and its limit.** Scripts do not run during verification, so a
JavaScript-driven layout is compared in its pre-script state. That is deliberate —
it makes the comparison deterministic — but it means the verifier checks the
document as delivered, not as an application later assembles it.

Geometry alone also misses anything that paints without occupying space. That is
not hypothetical: an earlier build of the HTML minifier emptied every inline
`style` attribute, and because a background image takes up no room, the layout
diff called the site clean. The background-image check exists because of that
miss, and the test for it names the bug.

---

## ADR-018 — Critical CSS extraction is not shipped

**Status:** accepted

**Context.** `docs/ROADMAP.md` lists "critical CSS extraction at mobile viewport,
inline + async rest" as part of Phase 4. Everything else in that phase is built.
This is not.

**Decision.** Do not ship it. Revisit only if all three objections below can be
answered.

**Reasoning.**

1. **It cannot be checked by the verifier that gates this phase.** The benefit
   comes entirely from making the stylesheet non-render-blocking, which requires
   swapping `rel` from a load handler. Verification runs with scripts disabled, on
   purpose (ADR-017), so the swap never fires and the full stylesheet never
   applies. Phase 4 is gated on being checkable; this is the one part of it that
   would not be.
2. **The benefit is a performance claim, and Law 5 forbids making one.** Inlining
   critical CSS does not make a file smaller — it makes the page *start* sooner,
   sometimes, depending on the server, the connection and the cache. Pare reports
   bytes. It has nothing honest to say about this.
3. **Getting the "above the fold" set wrong is a visible flash**, and the set
   depends on content the user's server produces that we never see — the same
   blindness as ADR-002, in a place where the failure is cosmetic rather than
   fatal, but still a failure.

**Alternatives considered.** Inlining the critical CSS while leaving the
stylesheet render-blocking is verifiable and safe, and delivers nothing: the page
still waits for the same file, now with duplicated bytes.

**Consequence.** Phase 4 ships without it, and `ROADMAP.md` records the gap rather
than implying it was delivered.

---

## ADR-019 — No Core Web Vitals number

**Status:** accepted

**Context.** `docs/ROADMAP.md` lists `web-vitals` measurement in the Phase 5
preview.

**Decision.** Do not measure or display it.

**Reasoning.** The preview renders from `blob:` URLs, in a hidden iframe, with
scripts disabled, on the machine doing the optimizing. LCP and CLS measured under
those conditions describe that environment and nothing else — not the user's host,
their TLS handshake, their visitor's phone, or their CDN. Publishing the number
would be a performance claim built on a measurement that does not transfer, which
is what Law 5 exists to prevent.

`docs/SCOPE.md` already rules out Lighthouse scoring because it "invites
performance claims we can't stand behind". A homegrown vitals number invites
exactly the same ones.

**Consequence.** The verifier answers "did anything change?", not "is it faster?".
The savings report answers the second question in bytes, which is the only
currency Pare deals in.
