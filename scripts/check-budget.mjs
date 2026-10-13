// AGENTS.md: initial JS budget is 150 KB gzipped, enforced in CI.
//
// "Initial" is the load-bearing word. The previous version of this script summed
// every .js file in dist/assets, which conflates two opposite things: the entry
// graph a visitor downloads before they do anything, and the codec chunks that
// exist precisely so they are *not* downloaded until a file is dropped. Under
// that measurement, lazy-loading a 2 MB encoder made the number worse.
//
// So: start at the scripts the built page itself loads, find them in the Vite
// manifest, and follow `imports` only. `dynamicImports` are deliberately not
// followed - that is the whole point. (Starting from the page rather than the
// manifest's `isEntry` flag: with several pages sharing one app, ADR-035, the
// app is recorded as a shared chunk and no chunk is flagged an entry.)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 150 * 1024;
const DIST = 'dist';
const MANIFEST = join(DIST, '.vite', 'manifest.json');

if (!existsSync(MANIFEST)) {
  console.error(`No manifest at ${MANIFEST}. Run "npm run build" first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const page = readFileSync(join(DIST, 'index.html'), 'utf8');
const loaded = new Set([...page.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]));
const entries = Object.values(manifest).filter((c) => c.isEntry || loaded.has(c.file));

if (entries.length === 0) {
  console.error('No script in dist/index.html is in the manifest.');
  process.exit(1);
}

const seen = new Set();
const initial = [];

function walk(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) return;
  initial.push(chunk.file);
  for (const dep of chunk.imports ?? []) walk(dep);
  // chunk.dynamicImports is intentionally not walked.
}

for (const entry of entries) {
  walk(Object.keys(manifest).find((k) => manifest[k] === entry));
}

let total = 0;
for (const file of initial) {
  if (!file.endsWith('.js')) continue;
  const size = gzipSync(readFileSync(join(DIST, file))).length;
  console.log(`  ${file}  ${(size / 1024).toFixed(1)} KB gz`);
  total += size;
}

// Everything on disk that the initial graph does not pull in is, by definition,
// deferred. Counted from the filesystem rather than the manifest, which records
// only the entry.
const shipped = readdirSync(join(DIST, 'assets'));
const deferredJs = shipped.filter((f) => f.endsWith('.js') && !initial.includes(`assets/${f}`));
const wasm = shipped.filter((f) => f.endsWith('.wasm'));

console.log(
  `\n${deferredJs.length} JS chunk(s) and ${wasm.length} WASM module(s) deferred to first use.`,
);

// AGENTS.md: WASM is never in the initial bundle. If a codec were imported
// statically it would be inlined into the entry and there would be nothing
// deferred at all - which is the shape this catches.
if (wasm.length > 0 && deferredJs.length === 0) {
  console.error('\nWASM shipped with no deferred chunk to load it. Check for a static import.');
  process.exit(1);
}

console.log(`initial ${(total / 1024).toFixed(1)} KB gz / ${(LIMIT / 1024).toFixed(0)} KB budget`);

if (total > LIMIT) {
  console.error('\nOver budget. Lazy-load something or drop a dependency.');
  process.exit(1);
}
console.log('Within budget.');
