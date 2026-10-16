# Pare

**Optimize your site's assets in the browser. No install, no upload, no account.**

Drop in your images, fonts and code. Pare compresses, converts and resizes them,
then hands you the optimized files plus the HTML to paste in.

Everything runs locally in your browser. Your files never leave your computer.

→ **[pare.devstash.me](https://pare.devstash.me)** *(not deployed yet — see
[`docs/STATUS.md`](docs/STATUS.md))*

---

## Why

Most sites are 60–80% images. Optimizing them is the single highest-leverage
performance fix available, and the existing options are all awkward:

- **Build tools** (Parcel, Vite) do this well, but require Node, a terminal, and a
  project structure. If you're maintaining a PHP theme or a static site, that's a wall.
- **Online compressors** (TinyPNG et al.) upload your files to someone else's server,
  and hand back a file with no markup to use it properly.

Pare sits in between. Zero install like a web tool, real codecs like a build tool,
and it gives you the `<picture>` tag, not just the file.

## What it does today

Drop a **whole folder** and Pare optimizes it in place, fingerprints the filenames
it can safely rename, updates every address pointing at them, then renders each
page before and after to prove nothing moved — and only then offers the download.

Or drop **loose files** and get optimized assets plus the markup to paste in:

- **Images** — resize to a breakpoint ladder, encode AVIF + WebP alongside an
  optimized original-format fallback, strip metadata, generate blur placeholders
- **Fonts** — split by writing system so a page downloads only the scripts it
  uses, or subset to the characters you actually use; WOFF2 out
- **Code** — minify CSS, JavaScript, HTML and SVG; prefix CSS to a stated browser
  floor; write gzip and brotli siblings; optionally bundle `type="module"`
  scripts, and squeeze JavaScript harder with a second pass
- **Snippets** — paste-ready `<picture>` and `@font-face`, with `srcset`, `sizes`,
  `width`, `height` and `unicode-range` filled in
- **Report** — honest before/after bytes, per file and per type, with every skip
  explained in plain language

## What is planned

Every phase in [`docs/ROADMAP.md`](docs/ROADMAP.md) is now built. Two items inside
them were deliberately not shipped — critical CSS extraction and a Core Web Vitals
number — because neither could be made honest. The reasoning is in
[ADR-018](docs/DECISIONS.md) and [ADR-019](docs/DECISIONS.md), and the gaps are
listed in [`docs/STATUS.md`](docs/STATUS.md).

## What it deliberately doesn't do

Pare never removes CSS rules, DOM nodes, attributes, or JS exports. It compresses
and converts; it doesn't delete. That constraint is the point: **Pare cannot break
your site.**

It runs the same minifiers everyone else does, configured to rewrite and never to
remove — so an unused CSS rule survives, `alt=""` survives, an SVG id survives, and
a global in a classic script keeps its name. The one operation that can genuinely
lose something, subsetting a font down to the characters it can see, is off by
default and says so when you turn it on.

Folder mode renames a file only when **every** reference to it could be traced. A
path built in JavaScript, a `url()` in an inline `style` attribute, a server
template — any one of those and the file keeps its name, and Pare tells you which
file and why. Then it renders every page before and after and compares them; if
anything moved, you do not get a download.

Tools that strip "unused" CSS can't know what a database-driven or JS-toggled class
will be, and they break pages nobody tests. We'd rather ship a smaller win you can trust.
See [ADR-002](docs/DECISIONS.md#adr-002--css-purging-is-permanently-out-of-scope).

## Privacy

There is no server. No upload, no analytics, no account, no telemetry. After the
page loads, you can disconnect from the internet and it still works.

## From the command line, or in CI

The same engine, because it is the same app: the command opens Pare in a
headless Chromium on your machine and hands it the folder. Nothing goes to a
server. If the before-and-after check finds a page that changed, it writes
nothing and exits with 1.

```bash
npm install
npx playwright install chromium
node cli/pare.mjs ./public --out ./public-pare
```

`--keep-names` keeps every filename, `--files` treats the folder as separate
files rather than a site, and `--url http://localhost:4173` runs your own
`npm run preview` instead of pare.devstash.me.

As a GitHub Action:

```yaml
- uses: adeshukla/pare@master
  with:
    path: public
    out: public-pare
```

## Development

Node 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run lint` | ESLint, flat config |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — pure logic, no browser |
| `npm run e2e` | Playwright — real codecs in Chromium |
| `npm run build` | Typecheck, then production build |
| `npm run budget` | Fails if the initial JS exceeds 150 KB gzipped |
| `npm run verify` | All of the above, in the order CI runs them |

`npm run e2e` needs a browser once: `npx playwright install chromium`.

The two test tiers split on whether a browser is required — logic runs in Node,
codecs run in Chromium against committed fixtures. See
[ADR-010](docs/DECISIONS.md#adr-010--two-test-tiers-split-on-whether-the-browser-is-required).

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it's the contract for this repo, for humans
and AI agents alike. Then [`docs/SCOPE.md`](docs/SCOPE.md) for what's in and out.

Every architectural choice lives in [`docs/DECISIONS.md`](docs/DECISIONS.md).
If you disagree with one, write a superseding ADR rather than arguing in a PR.

Where the project actually stands — what works, what is missing, what is next —
is in [`docs/STATUS.md`](docs/STATUS.md).

## License

All rights reserved. The hosted tool is free to use, and everything it produces
from your files is yours; the source code may not be reused without permission.
See [`LICENSE`](LICENSE).
