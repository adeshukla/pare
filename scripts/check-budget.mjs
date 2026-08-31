// AGENTS.md: initial JS budget is 150 KB gzipped, enforced in CI.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 150 * 1024;
const dir = 'dist/assets';
let total = 0;

for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const size = gzipSync(readFileSync(join(dir, f))).length;
  console.log(`  ${f}  ${(size / 1024).toFixed(1)} KB gz`);
  total += size;
}

console.log(`\ntotal ${(total / 1024).toFixed(1)} KB gz / ${(LIMIT / 1024).toFixed(0)} KB budget`);
if (total > LIMIT) {
  console.error('\nOver budget. Lazy-load something or drop a dependency.');
  process.exit(1);
}
console.log('Within budget.');
