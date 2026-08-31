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

**Status:** proposed

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
