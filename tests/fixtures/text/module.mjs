// A real module. Top-level names are scoped to the file, so mangling them is
// safe and the minifier is allowed to do it.
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 5000;

export function createLoader(endpointUrl) {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    DEFAULT_TIMEOUT_IN_MILLISECONDS,
  );

  return fetch(endpointUrl, { signal: abortController.signal }).finally(() => {
    clearTimeout(timeoutHandle);
  });
}
