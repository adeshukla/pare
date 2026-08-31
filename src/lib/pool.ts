import * as Comlink from 'comlink';
import type { Remote } from 'comlink';
import type { InspectApi } from '../workers/inspect.worker';

/**
 * One pool for the whole app, sized to hardwareConcurrency - 1 so the main thread
 * keeps a core. All heavy work goes through here — AGENTS.md forbids running WASM
 * or codecs on the main thread.
 *
 * Workers are created lazily on first task so an idle visit costs nothing.
 */

type Task<T> = (api: Remote<InspectApi>) => Promise<T>;

const SIZE = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

type Slot = { api: Remote<InspectApi>; worker: Worker; busy: boolean };

const slots: Slot[] = [];
const queue: Array<() => void> = [];

function spawn(): Slot {
  const worker = new Worker(new URL('../workers/inspect.worker.ts', import.meta.url), {
    type: 'module',
  });
  const slot: Slot = { api: Comlink.wrap<InspectApi>(worker), worker, busy: false };
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
  return new Promise((resolve) => {
    queue.push(() => {
      const next = slots.find((s) => !s.busy);
      if (next) {
        next.busy = true;
        resolve(next);
      }
    });
  });
}

function release(slot: Slot) {
  slot.busy = false;
  queue.shift()?.();
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
export function runAll<I, O>(items: I[], task: (item: I, api: Remote<InspectApi>) => Promise<O>) {
  return Promise.all(items.map((item) => run((api) => task(item, api))));
}

export const poolSize = SIZE;

export function terminate() {
  for (const s of slots) s.worker.terminate();
  slots.length = 0;
  queue.length = 0;
}
