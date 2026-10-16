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

---

## ADR-020 — CSSO is rejected as the second CSS pass

**Status:** accepted

**Context.** `docs/ROADMAP.md` lists "optional deeper passes: `csso`, `terser`" in
Phase 3. Terser shipped. CSSO was implemented, tested, and removed.

**Decision.** There is no second CSS pass. Terser remains as the optional second
JavaScript pass.

**Reasoning.** CSSO silently deletes CSS it cannot parse.

Lightning CSS, targeting modern browsers, emits media queries in range syntax:

```css
@media (width>=768px){.card{padding:24px 32px}}
```

CSSO 5.0.5 predates that syntax. Handed the stylesheet above it does not error,
does not warn, and does not pass the rule through — it returns the stylesheet with
the entire `@media` block gone. The rule and everything inside it simply cease to
exist, and the only symptom is a site whose responsive layout stops working.

That is precisely what Law 2 forbids, and no configuration prevents it: the loss
happens in the parser, before any option is consulted. `restructure: false` does
not help, because restructuring is not the problem.

The general shape of the problem is worse than this one instance. CSSO's last
release predates container queries, `:has()`, native nesting, cascade layers and
relative colour syntax. Every one of those is CSS a user may reasonably have
written, and every one is a chance for the same silent deletion. Pare would be
shipping a component guaranteed to fall further behind the language it is fed.

**Alternatives considered.**

- *Run CSSO first, on the authored CSS, and let Lightning CSS finish.* Avoids the
  range-syntax case but not the general one — the user's own stylesheet may
  contain anything newer than 2021.
- *Guard the output by checking every at-rule survived.* Catches this failure but
  not a dropped declaration or an unparseable value, and a guard that covers some
  silent deletions invites more confidence than it earns.
- *Ship it off by default with a warning.* Rejected for the same reason ADR-002
  rejects an off-by-default CSS purger: a dangerous default that happens to be off
  is still a dangerous default.

**Consequence.** CSS gets one pass. Lightning CSS is actively maintained, is
already doing the safe work well, and the marginal bytes CSSO offered were never
worth a silent deletion.

The evidence is reproducible: minify `tests/fixtures/text/site.css` at the modern
target and pass the result to CSSO. The `@media` block does not come back.

---

## ADR-021 — Whole-site mode may offer AVIF and WebP through `<picture>`, opt-in

**Status:** accepted. Narrows the "bytes change, markup does not" rule that
`folder.ts` and `STATUS.md` stated for Phase 4; that rule was never an ADR.

**Context.** Files mode turns a photograph into AVIF and WebP and hands over a
`<picture>` snippet: a 70–90% saving. Whole-site mode re-encoded each image in its
own format: 20–40%. The difference was the largest gap in the product, and it was
there on purpose — offering a modern format means wrapping the `<img>`, and a new
parent can change what CSS matches.

**Decision.** Ship it, off by default, behind three fences:

1. **A static selector check** (`imageSensitiveSelector`). Any selector that picks
   an image by its parent or siblings — `> img`, `img + p`, `img ~ x`,
   `img:first-child` and the other structural pseudo-classes, `:has(… img)` — or
   that styles `picture` or `source` at all, and **nothing in the site is
   wrapped**. The user is told which selector, as they wrote it.
2. **A script check** (`scriptsBlockWrapping`). A `<source>` silently overrules an
   `<img src>` a script just set. Any page whose inline scripts, inline handlers or
   local scripts assign `.src` / `.srcset` is not wrapped, and neither is a page
   that loads a script from outside the folder, which cannot be read. Law 3's
   reasoning, applied to a different question.
3. **The verifier**, extended. `<picture>` is see-through when matching elements,
   so a wrapped `<img>` is compared with the one it replaced, and every `<img>`'s
   full computed style is compared as well as its box. That catches what the static
   check cannot see — `.row > * { opacity: .5 }` names no image, but after wrapping
   it lands on the `<picture>` and the image loses it without moving a pixel. The
   test for exactly that case is in `tests/e2e/picture.spec.ts`.

Images that already have a `srcset`, already sit in a `<picture>`, or carry a
lazy-loader's `data-src` are left as written. A copy is named beside its original
(`hero.jpg` → `hero.avif`), never over an existing file, is emitted only if a page
now offers it, and is fingerprinted only if its original was.

**Reporting (ADR-009).** The headline counts the smallest version a browser picks
— but only for an image *every* reference to which now offers one. An image also
used as a CSS background is counted at its original size, and says why. The zip
size, which includes every version, is shown beside it.

**Alternatives considered.**

- *`image-set()` in CSS instead.* Covers backgrounds, not `<img>`, which is where
  most image bytes are.
- *Content negotiation (`Accept: image/avif`) on the server.* Needs a server. Law 1.
- *Wrap everything and trust the verifier alone.* The verifier runs without
  scripts (ADR-017), so it cannot see fence 2's failure. Each fence covers a
  different blind spot.

**Consequence.** One option in Phase 4 now changes markup. It is labelled as the
one that does, it is off by default, and when the verifier objects the first
remedy offered is turning it off.

---

## ADR-022 — Animated GIFs are copied unchanged

**Status:** accepted; superseded in files mode by ADR-038 (animated WebP). Whole-site mode still copies animations unchanged.

**Context.** Pare decodes a GIF's first frame only, because none of its encoders
write animated AVIF or WebP. Files mode used to encode that frame anyway and warn
that the result no longer animates.

**Decision.** Detect animation by walking the GIF's block structure
(`isAnimatedGif`), and copy an animated GIF through unchanged with a
plain-language reason. A single-frame GIF is converted like any other image.

**Reasoning.** A still picture of frame one is not a smaller version of an
animation, it is a different file. Reporting it as a saving — even with a warning
attached — breaks Law 5, and putting it in a `<picture>` snippet invites the user
to ship it. Leaving the file alone costs bytes, never correctness.

**Revisit** if a browser-side animated WebP or AVIF encoder becomes available.

---

## ADR-023 — Offline after first use, through a service worker

**Status:** accepted

**Context.** Law 1's own test is "works with the network cable unplugged after
first load". Without a service worker that was only true until the tab closed.

**Decision.** `public/sw.js`, registered in production builds only. The page is
network-first, so a deploy is picked up whenever there is a connection; hashed
assets and WASM are cache-first, filled as each is first used. Each build
registers the worker with its own `?v=` and deletes the previous build's cache.

**Reasoning.** Precaching every codec would make a first visit download ~40 MB
of WASM a visitor may never use (esbuild and Lightning CSS alone are 30 MB).
Caching on use keeps the first visit as light as it is today, and the footer
says exactly what is true: what you have used once keeps working offline. Two
details the offline test caught: the page's own script and stylesheet load before
the worker exists, so install reads them out of the HTML and caches them; and a
host's `Vary: Origin` makes exact cache matches miss, so lookups ignore `Vary`.

**Consequence.** No telemetry, no network calls of its own — the worker only
ever fetches Pare's own files. `tests/e2e/offline.spec.ts` runs against the
built site and reloads with the network off.

---

## ADR-024 — Save to a folder, but only an empty one

**Status:** accepted

**Context.** On Chromium the File System Access API can write a whole tree, which
saves the user an unzip. The zip download stays, and stays the only path in
Firefox and Safari.

**Decision.** "Save to a folder…" asks for a folder and **refuses one that already
contains anything**.

**Reasoning.** Law 4: originals are never modified in place. Pare cannot tell a
folder the user just created from the one their live site is in, and asking "are
you sure you want to overwrite 40 files?" is the kind of prompt people click
through. "Pare never overwrites anything" is a rule a user can hold in their
head; an empty folder satisfies it trivially.

**Consequence.** One extra step for someone who wanted to write over a copy — they
make a new folder. `tests/unit/save-folder.test.ts` covers the refusal with a fake
directory handle; the picker itself cannot be driven from a test.

---

## ADR-025 — Visual direction: a precision tool with a motion language

**Status:** accepted. Replaces the "measuring instrument" direction (thin rules,
no radius, colour only for savings), which read as unfinished next to current
tools and gave a first-time visitor nothing to start from.

**Context.** Three directions were built as working slices of the real screens
(`scratchpad/pare-directions.html`, not shipped): the incumbent, *Precision*
(neutral zinc, one indigo accent, 8–12px radius) and *Calm* (roomy, consumer).
The owner picked Precision and asked for it to be more visual, more fun, with
motion and interaction.

**Decision.**

- **Tokens** (`src/index.css`): zinc neutrals, an indigo→violet accent for
  anything you can act on, emerald only ever for a measured saving, amber for
  anything skipped. Light and dark, by system setting or a manual choice applied
  before first paint.
- **Visuals that carry information**: real image thumbnails and "Aa" set in the
  dropped font itself in the file list; colour-coded type badges; a stacked bar
  of the saving by file type; per-format size bars beside each image.
- **A motion language with five named movements**, all CSS: *arrive* (rows and
  cards rise in, staggered), *pare* (the "after" number counts down from the
  "before", and a bar shrinks to what is left), *sweep* (pages being checked at
  three widths), *settle* (switches and segmented controls move on a spring),
  and *mark* (a drawn check, and one burst of dots for a saving of 20% or more).

**Law 5, kept.** Animation only moves *towards* a figure Pare computed; the final
text is in the DOM from the first frame, for screen readers and tests. The
illustrations on the landing page contain no numbers, so they cannot be read as
a claim.

**Accessibility.** `prefers-reduced-motion` stops every animation and the
counters jump straight to their value. Switches stay `role=checkbox` with
explicit accessible names; segmented controls are radio groups whose inputs cover
their labels. Focus rings use the accent.

**Cost.** Initial JS went from 86.0 to 94.2 KB gzipped of the 150 KB budget. No
animation or icon library — a dozen inline icons and CSS keyframes.

---

## ADR-026 — HEIC and BMP are accepted as inputs

**Status:** accepted

**Context.** People drop iPhone photos (HEIC) and screenshots saved as BMP, and
got nothing back: neither was recognised. Only Safari decodes HEIC, and WebKit
cannot decode anything natively inside a worker.

**Decision.**

- **Detection by content.** HEIC and AVIF share a container and often the
  generic `mif1` brand, so the whole `ftyp` brand list is read, not just the
  first brand. BMP needs `BM` *and* a real DIB header size.
- **HEIC** decodes natively where the browser can, otherwise through
  `libheif-js` 1.23 (the WASM build with its binary inlined, ~1.9 MB), loaded
  only when a HEIC file is dropped, in a worker. Orientation is applied by
  libheif. The universal fallback is JPEG; the original HEIC is never offered as
  a fallback, because most browsers cannot show it.
- **BMP** decodes natively, otherwise through `src/lib/bmp.ts` (1/4/8/16/24/32
  bit, bit-field masks, either row order; RLE refused rather than guessed). The
  fallback is PNG, which keeps it exact.
- **Whole-site mode** converts BMP to PNG — lossless, so the page looks
  identical and the verifier compares like with like — and renames it, but only
  where every reference can be rewritten (Law 3); otherwise the conversion is
  undone and the BMP kept. HEIC is left alone in whole-site mode: converting it
  makes the page look different in every non-Safari browser, which the
  before-and-after check cannot fairly compare. Files mode handles it.

**Licence.** libheif and libde265 are LGPL-3.0. Pare loads the published,
unmodified package as its own separately fetched file, never merged into Pare's
own code, so it can be replaced; its licence ships with it in `node_modules` and
is named in `THIRD_PARTY.md`. If that arrangement is ever in doubt, HEIC can be
switched off by removing one case from `decodeWasm` — nothing else depends on it.

---

## ADR-027 — Server templates are read, never written; a templated site is never renamed

**Status:** accepted

**Context.** The audience includes WordPress and PHP theme developers. Their pages
are built on a server by templates Pare cannot run, and files are referred to
from places Pare cannot see: a child theme, a plugin, the database.

**Decision.**

- PHP and other server templates (Twig, Blade, Liquid, ERB, Nunjucks,
  Handlebars, Smarty, Razor, JSP and others) are a kind of their own. They are
  copied byte for byte — never minified, never rewritten.
- Anything a template mentions by file name is pinned, the same blunt rule as
  scripts: it keeps its name.
- **A folder containing any template is never renamed at all**, whatever the
  fingerprint switch says, and the switch is shown disabled with the reason.
  WordPress adds `?ver=` for caching itself, so nothing is lost.
- A folder of templates with no `.html` is still a site: whole-site mode is
  offered, every file is optimised in place under its own name, and the
  verification panel says plainly that template pages cannot be rendered in a
  browser tab — which is why only changes that need no rendering were made.
- A WordPress theme header (`Theme Name:` at the top of `style.css`), a plugin
  header, and any `/*!` licence comment survive CSS minification. Without the
  header WordPress stops listing the theme.
- Font subsetting reads template text as well as HTML, and still warns that
  database content is invisible.

---

## ADR-028 — How hard JavaScript is minified, for which browsers, and getting the original back

**Status:** accepted

**Context.** Minifiers rename variables, and renaming is the classic way a
minified site breaks. Separately, the JavaScript target was hard-coded and
ignored the "browsers to support" choice entirely.

**Decision.**

- **Three levels.** *Safe*: whitespace, comments and syntax only — no name
  changes anywhere. *Balanced* (default): also shortens names that exist only
  inside a function or a module. *Maximum*: Balanced plus a second Terser pass.
  At every level, a top-level name in a classic script is never renamed —
  another script, an inline handler or `setTimeout("fn()")` can reach it
  (ADR-003). Verified against esbuild directly: it renames locals only.
- **Name-sensitive code is held at Safe automatically**: `eval`, `new Function`,
  `with`, `arguments.callee`, AngularJS-style injection (`angular.module`,
  `$inject`) and functions reading their own source. The row says which and why.
- **Source maps**, on by default in files mode: a `.map` beside each CSS and JS
  file with the original text inside it. Dev tools show the code as written, and
  the original can always be recovered from the map alone. Visitors never
  download maps. Off in whole-site mode, where renaming would make the map's
  pointer circular.
- **Browser ranges** drive CSS *and* JavaScript output: Latest (2023+), Since
  2021 (default) and Since 2017. Newer syntax in the input is rewritten down to
  the range; output never uses syntax the range cannot run. A file that cannot be
  rewritten that far is copied unchanged with a plain explanation. Terser's
  `ecma` and its Safari 10 workaround follow the range. Choosing Since 2017 also
  turns on WOFF fonts, since Safari 11 predates WOFF2.

**Consequence.** The default moved from "Latest" to "Since 2021". CSS for that
range is sometimes a little larger (Lightning CSS adds fallbacks such as a full
`system-ui` font stack); when minifying would make a file bigger, Pare keeps the
original, as it always has.

---

## ADR-029 — A .zip in a drop is opened in place

**Status:** accepted

**Context.** WordPress themes and plugins ship as zips, and so do most site
exports. A dropped zip used to be copied through as an opaque file.

**Decision.** Every `.zip` in a drop (checked by its `PK\x03\x04` signature, not
just its name) is opened with fflate and its contents take its place, at the
path the zip sat at. Then classification, the mode choice and everything else
proceed as for a dropped folder.

**Guards.** Limits are read from the archive's own directory before anything is
inflated: at most the folder file cap (5,000) and 2 GB unpacked, otherwise the
zip is refused and kept as a file. Entry paths that climb out (`../`) are
dropped; `__MACOSX`, `.DS_Store`, `node_modules` and version-control folders are
skipped; a zip inside a zip is left shut. An encrypted or damaged zip is kept as a
file. Every outcome is reported in one plain line.

---

## ADR-030 — Whole-site mode scales images to the size they are shown at

**Status:** accepted

**Context.** A 4000px photo shown at 800px is the most common waste on real
sites, and whole-site mode only re-compressed images at their own size.

**Decision.** On by default, with its own switch. Before optimizing, every page
is rendered at 360, 768, 1280 and 1920px; each `<img>`'s displayed width is
recorded and multiplied by that screen's usual pixel ratio (3 for 360, 2 for the
rest). An image is scaled down to the largest of those, never up, and only when
that saves at least 10% of its width.

**Only where nothing else can see it.** An image qualifies only if every
reference to it is a plain `<img src>` that resolves, and Law 3 would let it be
renamed — so nothing a stylesheet (a background), a script, a template or an
inline style uses, and nothing inside `<picture>` or with a `srcset`, where the
browser chooses the size. A folder with templates is never right-sized. Images
that do not load while being measured are left alone; lazy images are loaded
eagerly in the measuring copy only.

**Why it is safe to ship.** Scaling down changes an image's intrinsic size, which
only affects layout when the page relies on that size. If it does, the image was
displayed at its natural width, so the measured need is at least that and no
resize happens. Either way the verifier then compares every element's box before
and after, as for every other change.

**Honest cost.** On a screen wider than 1920 CSS pixels at 2x, a full-width image
can be softer than the original. The switch says what it does.

---

## ADR-031 — Unused CSS is reported, never removed

**Status:** accepted. Does not supersede ADR-002; it is the safe half of it.

**Context.** People ask for unused CSS to be removed. ADR-002 explains why Pare
cannot do that safely: classes come from databases, scripts, other pages and
states no static render reaches.

**Decision.** After a whole-site run, an opt-in button renders every page and
lists each rule in the site's own stylesheets and `<style>` blocks that matched
nothing anywhere — grouped by file, with sizes, and copyable. States and parts
(`:hover`, `::before`) are stripped before matching, which can only make a rule
look *more* used; nested `&` rules count as used. The panel says plainly what the
list cannot know. Nothing is edited: the download is byte-identical with or
without the report.

**Why a report is worth having.** The site's author knows whether `.cart-error`
is dead. Pare can show them where to look, at no risk to anyone.

---

## ADR-032 — A single large image is spread across idle workers

**Status:** accepted

**Context.** One image used one worker for every width and format; a 14-megapixel
screenshot took about four minutes while the other workers sat idle.

**Decision.** When a drop has fewer files than workers, each image is split into
jobs per format and per width slice (largest widths dealt first), run across the
pool and merged back. Full batches are left alone — they already fill the pool,
and splitting would only repeat each decode. AVIF encodes at speed 7 rather than
6: on a real photo it is 4% smaller and more than twice as fast (speed 8 was
tried for large images and rejected: 47% larger). Encoders start loading the
moment images are dropped. Whole-site runs render each page once and resize it
through every width, several pages at a time, and minify text while images are
being measured: the 40-page benchmark went from 27.6 s to 9.7 s. The 14 MP screenshot that
took about four minutes now takes 63 seconds on the production build. The built-site preview sends production's
isolation headers and a production smoke test runs it in all three engines; the
dev server does not send them, because WebKit refuses its injected worker client
under COEP and the threaded encoder then hangs - in development only.

---

## ADR-033 — Each codec is fetched by one worker first

**Status:** accepted

**Context.** Every pool worker loads its own copy of a codec. When several start
at once they all request the same WASM file - 3.4 MB for AVIF, 14-16 MB for
esbuild and Lightning CSS - and neither a service worker nor every browser's
HTTP cache merges requests that are still in flight. An audit with the cache
off measured ~45 MB of encoder traffic for a single photo.

**Decision.** Jobs declare the codecs they need (`src/lib/needs.ts`). The first
job to need a codec loads it on its own worker before running; every other job
needing it waits only for that load - not for the first job to finish - and then
loads from the cache. The drop-time warm-up (ADR-032) goes through the same gate.

**Consequence.** One network download per codec on any browser. No measured
slowdown locally (twenty photos: 7-8 s with and without), since the wait is only
the download that had to happen anyway.

## ADR-034 — "Under a size": quality first, then dimensions, always reported

**Status:** accepted

**Context.** The most common thing people ask of an image tool is to make a
photo fit a limit - 20 KB for an exam portal, 100 KB for a job site, a few MB for
email. Pare offered quality sliders and widths, which leave the person to guess.

**Decision.** A third output mode, *Under a size*, with one-click limits (20 KB
to 1 MB) and a free field. For each format turned on, `src/lib/target.ts` tries
the user's quality; if that is too big, quality 30; if that fits, it searches
between the two for the highest quality that fits. Only when quality 30 is still
too big is the image scaled down, by the square root of the overshoot with a
margin, and the search repeated (at most eight rounds, never below 64 px wide).
An opaque PNG, GIF or BMP that is over the limit becomes a JPEG, since PNG has no
quality dial and nothing visible is lost; one already under the limit keeps its
format. Every trade - lower quality, smaller dimensions, a format change, or a
limit that could not be met - is a sentence on the file's row.

**Consequence.** One file per format, no responsive ladder: this mode is for a
file going into a form, not a page. A JPEG photo usually fits in 4-6 encodes.
`fitToSize` is pure and unit-tested with a fake encoder.

## ADR-035 — Task pages: the same app at its own address

**Status:** accepted

**Context.** People search for a task ("HEIC to JPG", "compress image to 100
KB"), not for an asset optimizer, and a landing page that says "images, fonts,
code, whole sites" does not tell them they have found it.

**Decision.** `src/tasks.ts` lists a few tasks, each with its own title,
description, headline and starting image settings. `scripts/make-task-pages.mjs`
(run by `dev` and `build`) writes `tools/<slug>/index.html` from `index.html`
with that page's title, description, canonical and share-card tags and a
`data-task` attribute, plus `public/sitemap.xml`. The app reads `data-task` for
the headline and the settings it starts from; each task page keeps its own saved
settings (`pare:settings:<slug>`), so using one never changes another. The footer
links every page to the others. The service worker caches each page under its
own path and falls back to the main page offline.

**Consequence.** Five static pages for the cost of one bundle; no router, no
server rendering. The generated pages are not committed (`/tools` is ignored).
With several pages the Vite manifest records the app as a shared chunk rather
than an entry, so `scripts/check-budget.mjs` now starts from the scripts the
built `index.html` loads.

## ADR-036 — Save and Share per file, and Pare in the share sheet

**Status:** accepted

**Context.** On a phone, a zip is a dead end: it lands in Downloads and most
people cannot open it. And the photo someone wants smaller is usually in their
gallery, not in a file picker.

**Decision.** Every finished row has a *Save* button for its main file - for an
image, the full-size file in the most widely readable format made (JPEG/PNG,
then WebP, then AVIF); for a font, the first slice; for code, the minified file -
and a *Share* button wherever the system can share that file
(`navigator.canShare`). The web app manifest declares a `share_target`, so on
Android an installed Pare appears in the share sheet. The system POSTs the files
to `/share-target`; with no server, the service worker takes them, keeps them in
a `shared-files` cache (outside the `pare-` caches a deploy deletes), and opens
`/?shared=N`; the page reads them once as if dropped, then empties the cache and
tidies the address.

**Consequence.** Files still never leave the device. Share-to-Pare needs the
service worker, so it works from the second visit on (and only once installed on
Android). Below the small breakpoint the results table drops its *Before* column
so the name, Save and the saving fit.

## ADR-037 — Width and height on images, only where trying them on moves nothing

**Status:** accepted

**Context.** An `<img>` without `width` and `height` takes no space until it
loads, so the page jumps. Adding the attributes is the standard fix, but they
are not free: on an image whose CSS sets its width and leaves its height to the
picture, a `height` attribute fixes the height in pixels and squashes it.

**Decision.** In whole-site mode, on by default with its own switch. While the
pages are rendered for right-sizing (ADR-030), every `<img>` that has neither
attribute is measured, given both at its natural size, measured again, and
restored. An image gets the attributes - at its final size, after any
right-sizing - only if that moved or resized nothing, on every page at every
width, and only where every reference to it is a plain `<img src>`. The tags are
spliced, never re-serialized (ADR-015). The verifier ignores `aspect-ratio` in
its style comparison, since that is what the attributes map to; its only effect
is on the box, which the geometry check still compares.

**Consequence.** Pages stop jumping where it is safe, and nowhere else. An
image hidden at every width, or one that did not load while measured, is left
alone.

## ADR-038 — More inputs: TIFF, animated GIF to animated WebP, JSON and XML

**Status:** accepted. Supersedes ADR-022 in files mode.

**TIFF.** Decoded with UTIF (Photopea, MIT, plain JavaScript, loaded on first
use) where the browser cannot - only Safari can. It comes out as JPEG, or PNG
when it has transparency. A multi-page TIFF converts its first page and says
so. Only files named `.tif`/`.tiff` count, because camera RAW files are TIFF
inside and would give their small preview.

**Animated GIF.** No browser-side encoder writes animated WebP, but the format
is a RIFF container around still WebP frames. The GIF's frames are decoded with
omggif and composited as a browser does (disposal and all), each full frame is
encoded with the existing still WebP encoder, and the frames are wrapped in
`ANIM`/`ANMF` chunks (`src/lib/animated-webp.ts`, unit-tested with a fake
encoder). The GIF is kept as the fallback. If the WebP is not smaller - small
flat-colour GIFs often are not - the GIF is kept unchanged and the row says so.
No AVIF is made for animations, and a size limit is not applied to them. An
animation is one job, never split across workers (ADR-032). Whole-site mode
still copies animations unchanged.

**JSON and XML.** JSON (including `.webmanifest`) loses whitespace outside
strings; nothing is re-printed, because `JSON.parse` then `stringify` would
round large integers and rewrite `1.0` as `1`. XML (sitemaps, RSS, Atom) loses
whitespace-only text that holds a line break between two tags, except an
element's own whitespace-only value. Files that ask for their whitespace
(`xml:space="preserve"`) and XHTML, where a line break between inline elements
is a visible space, are left alone. In whole-site mode anything a JSON or XML
file names keeps its name, since those files are not rewritten.

## ADR-039 — An icon set from one picture

**Status:** accepted

**Decision.** A fourth image output, *App icons*, and a "Make a favicon" task
page. From one picture: `favicon.ico` (16, 32 and 48 px PNGs inside, which every
current browser reads), `apple-touch-icon.png` (180), `icon-192.png`,
`icon-512.png`, a maskable 512 px icon with the picture inside the 80% safe
zone on its own corner colour (white when that is transparent), a
`manifest.webmanifest` listing them, and the three tags to paste. A picture
that is not square uses its middle; one under 512 px is enlarged, and the row
says so. One set per run, since the files have fixed names. Icons are always
PNG, so the format and quality settings do not apply; the panel says so.

## ADR-040 — Content-Security-Policy and HSTS

**Status:** accepted

**Context.** The audit found no CSP. Pare's checker renders the user's pages in
frames that inherit the page's policy, and the codecs are WebAssembly, so a
copied-in policy would break it.

**Decision.** `public/_headers` sends a policy that allows only this site's own
files, with three exceptions, each with one reason: `'wasm-unsafe-eval'` for the
codecs; the theme script inlined in `index.html` by its hash (a unit test keeps
the hash in step with the script); and `blob:`/`data:` plus inline styles for
dropped files and the checker's copies of a user's site. Scripts under
`/assets/` get their own policy, which adds `'unsafe-eval'`, because a worker
runs under its own script's policy and the WOFF2 codec's Emscripten glue builds
functions with `new Function` as it loads. No page code runs under that policy.
HSTS for a year.

**How it is tested.** `vite preview` now applies `public/_headers` path by path,
as Cloudflare does, so the production tests run under the shipped policy. A test
runs every codec and a whole-site check and fails on any refusal, and another
runs the WOFF2 font and the minifiers on their own. All three engines give a
worker its own script's policy; verified in Chromium, Firefox and WebKit. In
WebKit the ten-file test is marked as a known problem: ten mixed files at once
stall there at "Decoding" on the build machine, with this policy and without it.

**Consequence.** A user's page that names a file on another origin still does
not load it in the checker - cross-origin isolation already blocked that, on
both sides of the comparison.

## ADR-041 — Languages

**Status:** accepted

**Decision.** Hindi, Spanish, Portuguese and Indonesian, alongside English: the
languages of the most people who need "make my photo smaller". A language is an
address - `/hi/`, `/es/tools/compress-image/` - set as `<html lang>` by
`scripts/make-task-pages.mjs`, with `hreflang` links between every page and its
translations, so search engines send people to their own language. Nothing is
guessed from the browser, so a link opens in the language it was shared in. A
picker in the header moves to the same page in another language.

**What is translated.** The everyday path: the landing page, drop zone, run
button, results, savings, Save and Share, the size-limit and icon options, the
task pages. `src/i18n.ts` holds the words; English is the source, and a
language missing a key does not compile.

**What is not, yet.** Notes about a single file (they come from the worker),
the advanced settings, and whole-site mode. A translated page says the notes are
in English.

## ADR-042 — A command line and a GitHub Action

**Status:** accepted

**Decision.** `cli/pare.mjs` opens Pare in a headless Chromium on the machine it
runs on, hands it a folder, waits for the before-and-after check, and writes
what the page would let you download into an empty or new folder. It is the same
engine because it is the same app; files go from the disk into a local browser
tab and back. It exits 1, writing nothing, if the check finds a change.
`--keep-names`, `--files` and `--url` (to run a local `npm run preview` rather
than pare.devstash.me) are the only options.

`action.yml` wraps it as a composite GitHub Action, installing only the
command's two packages and a Chromium. Inputs reach the shell as environment
variables, never pasted into the script. CI runs the Action on the test site
against each commit's own build.

**Rejected:** porting the engine to Node. The codecs, the DOM parsing and above
all the verifier, which renders pages, are browser-native; a port would be a
second engine to keep in step with the first.
