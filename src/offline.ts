/**
 * Register the offline worker (public/sw.js, ADR-023). Production only: in
 * development it would cache Vite's modules and serve stale code after edits.
 *
 * Resolves true once a worker controls the page, which is when the UI may say
 * the tool works offline.
 */
export async function registerOffline(): Promise<boolean> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register('/sw.js?v=' + __BUILD_ID__);
    await navigator.serviceWorker.ready;
    return true;
  } catch {
    // Private windows and some enterprise policies refuse service workers.
    // Pare works the same online; it just will not work offline.
    return false;
  }
}
