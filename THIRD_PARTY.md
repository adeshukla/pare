# Third-party code

Pare's own code is all rights reserved (see `LICENSE`). It loads these libraries
in the browser; each keeps its own licence. Licence texts ship with each package
in `node_modules`.

| Package | Licence | Loaded |
|---|---|---|
| `libheif-js` (libheif, libde265) | LGPL-3.0 | Only when a HEIC file is dropped, as its own unmodified file. See ADR-026. |
| `@jsquash/*` (MozJPEG, libwebp, libavif, OxiPNG, resize) | Apache-2.0 | On first image of each format |
| `esbuild-wasm` | MIT | On first JavaScript file |
| `lightningcss-wasm` | MPL-2.0 | On first CSS file |
| `terser` | BSD-2-Clause | Only at the Maximum JavaScript level |
| `html-minifier-terser` | MIT | On first HTML file |
| `svgo` | MIT | On first SVG file |
| `harfbuzzjs` | MIT | On first font |
| `woff2-encoder` | MIT | On first font |
| `brotli-wasm` | Apache-2.0 | Only when `.br` copies are on |
| `thumbhash` | MIT | When placeholders are on |
| `fflate`, `react` | MIT | Always |
| `comlink` | Apache-2.0 | Always |
