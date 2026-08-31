# AGENTS.md — Pare

Read this before writing any code in this repo. It is the contract, not a suggestion.

---

## What Pare is

A browser-based asset optimizer for developers who don't have a build step.
Drop a folder or files in, get optimized assets plus paste-ready HTML snippets out.

**Everything runs client-side.** No server, no upload, no account, no API key.

## What Pare is not

Not a bundler. Not a framework tool. Not a Parcel competitor on features.
The only axis Pare wins on is: **zero install, and it cannot break your site.**

---

## The Five Laws

These are non-negotiable. A PR that violates any of them is rejected regardless of
how good the feature is.

### 1. No server. Ever.

Every operation runs in the user's browser. No backend, no serverless function,
no third-party API, no telemetry endpoint.

**Why:** the tool is free and must stay free. A server turns popularity into a bill,
and the bill is what kills free tools. Zero marginal cost per user is the business model.

**Test:** if the site works with the network cable unplugged after first load, you're compliant.

### 2. Never delete anything semantic.

Pare may compress, convert, resize, and rename. It may **not** remove CSS rules,
remove DOM nodes, remove JS exports, or drop attributes.

**Why:** the moment Pare can break a site, its one differentiator is gone. See
`docs/DECISIONS.md#adr-002` for why CSS purging is out of scope.

**Test:** could this change alter what renders in any state we didn't observe?
If yes, it doesn't ship.

### 3. Unresolvable reference means no rewrite.

If a reference to an asset cannot be fully resolved statically, that asset is not
hashed and not renamed. Emit a warning, leave it alone.

Sources of unresolvable references: URLs built by string concatenation in JS,
inline `onclick` handlers, `url()` inside inline `style` attributes, server-templated paths.

### 4. Every destructive step is toggleable and reversible.

Original files are never modified in place. Output goes to a new zip or a new
directory. Each optimization has its own switch in the UI, and the user can see
the before/after for each one.

### 5. Honest reporting only.

Never round savings up. Never claim a compliance, performance, or SEO outcome.
Report bytes and codecs. If a step was skipped, say which and why in plain language.

---

## Technical rules

### Stack

- **Vite + TypeScript + React.** No SSR, no router, no state library.
- **Tailwind v4** for styling.
- **Comlink** for all worker communication. Never raw `postMessage`.
- **fflate** for zip. Not JSZip.
- **DOMParser** for HTML. Not parse5 — it's already in the browser.
- `CompressionStream('gzip')` natively; `brotli-wasm` only for brotli.

### WASM discipline

- Every WASM module is **lazy-loaded on first use**, never in the initial bundle.
- Initial JS payload budget: **under 150 KB gzipped.** This is enforced in CI.
- WASM modules run in workers, never on the main thread.
- Show a loading state naming the module: "Loading AVIF encoder (1.2 MB)…"

### Worker rules

- One worker pool, sized to `navigator.hardwareConcurrency - 1`, minimum 1.
- Image encode/decode never touches the main thread.
- Every long task reports progress. No silent operations over 500 ms.

### Browser support

| Feature | Fallback |
|---|---|
| File System Access API | `webkitGetAsEntry()` folder drag-drop |
| Directory write | zip download via fflate |
| AVIF encode | WebP, then original |
| `OffscreenCanvas` | main-thread canvas |

Ship both paths. Never gate a core feature behind a Chromium-only API.

### Dependencies

Before adding any package, verify: does it run in a browser? Most of the standard
toolchain (sharp, Lighthouse, critical, penthouse, subset-font) is Node-only and
will not work here. Check first, don't assume.

Prefer native browser APIs over libraries wherever one exists.

---

## Working style

- **Read `docs/SCOPE.md` before proposing any feature.** If it's on the non-goals
  list, don't propose it. If you think a non-goal is wrong, argue in an ADR, not in code.
- **One phase at a time.** `docs/ROADMAP.md` is ordered. Don't start phase N+1
  while phase N is incomplete.
- **Every architectural choice gets an ADR** in `docs/DECISIONS.md`. Format is there.
- **No new abstractions until the third repetition.** Two similar functions is fine.
- **Tests:** every optimizer needs a fixture-based test proving output is decodable
  and smaller. Visual regression covers the rest.

## Definition of done for a feature

1. Runs in a worker, off the main thread
2. Reports progress
3. Has a toggle in the UI
4. Has a fixture test
5. Failure mode is "skip this file and warn," never "crash the run"
6. Contributes a line to the savings report
7. Emits its paste-ready snippet if it changes markup

---

## Naming

The tool is **Pare**, lowercase in code (`pare`), capitalized in prose.
CLI name reserved for later: `pare ./site`.
Never write "Pare.js" or "ParePress" or similar.
