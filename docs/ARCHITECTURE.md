# Architecture

## Shape

```
┌──────────────────────────────────────────────────┐
│  UI (main thread)                                │
│  drop zone · file tree · toggles · report        │
└───────────────────┬──────────────────────────────┘
                    │ Comlink
┌───────────────────▼──────────────────────────────┐
│  Orchestrator                                    │
│  builds job graph · schedules · aggregates stats │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│  Worker pool  (hardwareConcurrency - 1)          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│  │ image  │ │ font   │ │ text   │ │compress│     │
│  └────────┘ └────────┘ └────────┘ └────────┘     │
│  each lazy-loads its WASM on first job           │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│  Emitters                                        │
│  zip (fflate) · FS write · snippet generator     │
└──────────────────────────────────────────────────┘
```

## Core types

```ts
type Asset = {
  path: string;
  bytes: Uint8Array;
  kind: 'image' | 'font' | 'css' | 'js' | 'html' | 'svg' | 'other';
  refs: Reference[];        // where this asset is referenced from
  resolvable: boolean;      // false ⇒ never rename (Law 3)
};

type Job = {
  asset: Asset;
  optimizer: string;
  options: Record<string, unknown>;
};

type Result = {
  job: Job;
  outputs: Asset[];         // may be several: avif + webp + fallback
  snippet?: string;         // paste-ready markup
  bytesBefore: number;
  bytesAfter: number;
  warnings: Warning[];      // never throws; degrades
  skipped?: string;         // reason, in plain language
};
```

`Result` never carries an error. A failed optimizer returns the input unchanged
with a `skipped` reason. One bad file must not fail a run.

## Library assignments

| Slot | Library | Notes |
|---|---|---|
| Image codecs | `@jsquash/avif` `webp` `jpeg` `png` `oxipng` `resize` | Default. Lazy per-format. |
| Heavy image ops | `wasm-vips` | Opt-in only. ~10 MB. Smart crop, ICC. |
| SVG | `svgo` | Pure JS. |
| Placeholders | `thumbhash` | Tiny. |
| CSS | `lightningcss-wasm` | Minify, autoprefix, transpile. |
| CSS extra squeeze | `csso` | Optional second pass. |
| Targets | `browserslist` | Feeds lightningcss + esbuild. |
| JS | `esbuild-wasm` | Minify always. Bundle only for `type="module"`. |
| JS max squeeze | `terser` | Opt-in. Slow. |
| HTML parse | `DOMParser` | Native. Do not add parse5. |
| HTML minify | `html-minifier-terser` | Pure JS. |
| Font subset | `harfbuzzjs` (`hb-subset`) | Real subsetting. |
| WOFF2 | `wawoff2` | Compress/decompress. |
| gzip | `CompressionStream` | Native. |
| brotli | `brotli-wasm` | Native API can't do brotli. |
| Zip | `fflate` | Smaller and faster than JSZip. |
| Workers | `comlink` | Mandatory, per AGENTS.md. |
| Diff | `pixelmatch` | Phase 5. |

Verify versions and browser support on npm before installing. This ecosystem moves.

## Pipeline stages

1. **Ingest** — File System Access API, or `webkitGetAsEntry()` drag-drop fallback.
2. **Classify** — by magic bytes first, extension second. Never trust extension alone.
3. **Graph** — parse HTML with `DOMParser`, walk `<script src>`, `<link href>`,
   `<img src|srcset>`, `<source>`, and CSS `url()`. Mark every reference resolvable
   or not. Unresolvable propagates to the asset and blocks renaming.
4. **Plan** — build jobs from enabled toggles. Show the plan before running.
5. **Execute** — dispatch to pool, stream progress.
6. **Emit** — write outputs, generate snippets, build the report.

## Snippet generation

This is the feature that matters most to the target user and it is not an afterthought.
Every markup-affecting optimizer emits copy-paste-ready HTML:

```html
<!-- hero.jpg → 3 widths × 3 formats -->
<picture>
  <source type="image/avif" srcset="hero-400.avif 400w, hero-800.avif 800w, hero-1600.avif 1600w" sizes="(max-width: 768px) 100vw, 50vw">
  <source type="image/webp" srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1600.webp 1600w" sizes="(max-width: 768px) 100vw, 50vw">
  <img src="hero-800.jpg" width="1600" height="900" alt="" loading="lazy" decoding="async">
</picture>
```

A PHP or WordPress developer can't use a `dist/` folder. They can use this.

## Performance budgets

| Budget | Limit | Enforced |
|---|---|---|
| Initial JS, gzipped | 150 KB | CI |
| Time to interactive, mid-range mobile | 2 s | manual |
| Main-thread block during a run | 0 ms | code review |
| Silent operation | 500 ms max | code review |

## Failure philosophy

Degrade, never crash.

- Codec unavailable → next format down the chain
- File undecodable → pass through, warn
- Reference unresolvable → skip renaming, warn
- Out of memory on a large image → downscale first, retry once, then skip

Every skip appears in the report in plain language: not "ENOENT," but
"Couldn't read hero.jpg — the file may be corrupted. It was copied unchanged."
