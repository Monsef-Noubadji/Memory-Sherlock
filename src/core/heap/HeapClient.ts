import type { Op, ResultFor } from './protocol';

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Panel-side async client for the heap engine worker. The parsed graph
 * stays in the worker; every query returns a small, paged result.
 */
export class HeapClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'heap-engine' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const { id, ok, result, error } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error ?? 'heap worker error'));
    };
    this.worker.onerror = (ev) => {
      const err = new Error(`heap worker crashed: ${ev.message}`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  request<O extends Op>(op: O): Promise<ResultFor<O>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, op });
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
