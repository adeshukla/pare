export function formatBytes(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

// Nothing imports this. Tree shaking should drop it from the bundle, which is
// the whole reason bundling saves bytes rather than just requests.
export function neverImportedAnywhere() {
  return 'this string exists only to be removed by tree shaking, padded out so its absence is measurable';
}
