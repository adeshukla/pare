/**
 * Register the offline worker (public/sw.js, ADR-023). Production only: in
 * development it would cache Vite's modules and serve stale code after edits.
 *
 * Resolves true once a worker controls the page, which is when the UI may say
 * the tool works offline.
 */
/**
 * Files another app shared to Pare (ADR-036), which public/sw.js kept in the
 * 'shared-files' cache before opening the page with ?shared=. Read once, then
 * cleared, and the address tidied so a reload does not ask again.
 */
export async function takeSharedFiles(): Promise<File[]> {
  const url = new URL(location.href);
  if (!url.searchParams.has('shared') || !('caches' in window)) return [];
  url.searchParams.delete('shared');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    const cache = await caches.open('shared-files');
    const files: File[] = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const name = decodeURIComponent(response.headers.get('x-name') ?? 'shared');
      files.push(new File([await response.blob()], name, { type: response.headers.get('content-type') ?? '' }));
    }
    await caches.delete('shared-files');
    return files;
  } catch {
    return [];
  }
}

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
