# Pare

**Optimize your site's assets in the browser. No install, no upload, no account.**

Drop in your images, fonts, or whole project folder. Pare compresses, converts,
and resizes them, then hands you the optimized files plus the HTML to paste in.

Everything runs locally in your browser. Your files never leave your computer.

→ **[pare.devstash.me](https://pare.devstash.me)**

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

## What it does

- **Images** — resize to a breakpoint ladder, encode AVIF + WebP with fallback,
  strip metadata, generate blur placeholders
- **Fonts** — subset to the glyphs you actually use, convert to WOFF2
- **Text** — minify HTML, CSS, JS, SVG; autoprefix; gzip and brotli siblings
- **Snippets** — paste-ready `<picture>`, `srcset`, `@font-face`, and preload tags
- **Report** — honest before/after bytes, per file and total

## What it deliberately doesn't do

Pare never removes CSS rules, DOM nodes, or JS exports. It compresses and converts;
it doesn't delete. That constraint is the point: **Pare cannot break your site.**

Tools that strip "unused" CSS can't know what a database-driven or JS-toggled class
will be, and they break pages nobody tests. We'd rather ship a smaller win you can trust.
See [ADR-002](docs/DECISIONS.md#adr-002--css-purging-is-permanently-out-of-scope).

## Privacy

There is no server. No upload, no analytics, no account, no telemetry. After the
page loads, you can disconnect from the internet and it still works.

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it's the contract for this repo, for humans
and AI agents alike. Then [`docs/SCOPE.md`](docs/SCOPE.md) for what's in and out.

Every architectural choice lives in [`docs/DECISIONS.md`](docs/DECISIONS.md).
If you disagree with one, write a superseding ADR rather than arguing in a PR.

## License

MIT
