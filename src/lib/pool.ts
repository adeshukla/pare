import * as Comlink from 'comlink';
import type { Remote } from 'comlink';
import type { PipelineApi } from '../workers/pipeline.worker';

/**
 * One pool for the whole app, sized to hardwareConcurrency - 1 so the main thread
 * keeps a core. All heavy work goes through here - AGENTS.md forbids running WASM
 * or codecs on the main thread.
 *
 * There is a single worker script rather than one per job type. Each worker
 * dynamically imports only the codecs a given job needs, so a pool member that
 * never sees an AVIF never downloads the AVIF encoder.
 *
 * Workers are spawned lazily on first task, so an idle visit costs nothing.
 */

type Task<T> = (api: Remote<PipelineApi>) => Promise<T>;

const SIZE = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

type Slot = { api: Remote<PipelineApi>; worker: Worker; busy: boolean };

const slots: Slot[] = [];
const waiting: Array<(slot: Slot) => void> = [];

function spawn(): Slot {
  const worker = new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), {
    type: 'module',
  });
  const slot: Slot = { api: Comlink.wrap<PipelineApi>(worker), worker, busy: false };
  slots.push(slot);
  return slot;
}

function acquire(): Promise<Slot> {
  const free = slots.find((s) => !s.busy);
  if (free) {
    free.busy = true;
    return Promise.resolve(free);
  }
  if (slots.length < SIZE) {
    const slot = spawn();
    slot.busy = true;
    return Promise.resolve(slot);
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(slot: Slot) {
  const next = waiting.shift();
  // Hand the slot straight to the next waiter rather than freeing it first, so a
  // burst of acquires cannot race and leave a waiter parked forever.
  if (next) next(slot);
  else slot.busy = false;
}

export async function run<T>(task: Task<T>): Promise<T> {
  const slot = await acquire();
  try {
    return await task(slot.api);
  } finally {
    release(slot);
  }
}

/** Run tasks across the pool, resolving in input order. */
export function runAll<I, O>(items: I[], task: (item: I, api: Remote<PipelineApi>) => Promise<O>) {
  return Promise.all(items.map((item) => run((api) => task(item, api))));
}

export const poolSize = SIZE;

/**
 * Start `count` workers loading the given encoders, without waiting. Called
 * when files are dropped, so the downloads and compiles happen while the user
 * is still looking at the settings rather than after they press the button.
 */
export function warmUp(kinds: string[], count: number): void {
  const n = Math.max(0, Math.min(SIZE, count));
  for (let i = 0; i < n; i++) void run((api) => api.warm(kinds)).catch(() => undefined);
}

export function terminate() {
  for (const s of slots) s.worker.terminate();
  slots.length = 0;
  waiting.length = 0;
}
