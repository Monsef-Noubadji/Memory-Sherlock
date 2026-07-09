import { describe, it, expect, vi } from 'vitest';
import { createSessionStore } from '../stores/session';
import type { PanelToBackground } from '@/shared/messages';

function makeStore() {
  const posted: PanelToBackground[] = [];
  const loadSnapshot = vi.fn(async (chunks: string[]) => ({
    snapshotId: 1,
    nodeCount: 42,
    totalSize: chunks.join('').length,
  }));
  const store = createSessionStore({
    post: (m) => posted.push(m),
    loadSnapshot,
    now: () => 1000,
  });
  return { store, posted, loadSnapshot };
}

describe('session store', () => {
  it('tracks session state and capabilities from background messages', () => {
    const { store } = makeStore();
    store.getState().onMessage({ type: 'session-state', state: 'attached' });
    store.getState().onMessage({ type: 'capabilities', agent: true, debugger: true });
    expect(store.getState().sessionState).toBe('attached');
    expect(store.getState().capabilities).toEqual({ agent: true, debugger: true });
  });

  it('accumulates telemetry batches without duplication', () => {
    const { store } = makeStore();
    const ev = { kind: 'memory-sample', usedJSHeapSize: 1, totalJSHeapSize: 2, t: 1 } as const;
    store.getState().onMessage({ type: 'telemetry-batch', events: [ev, ev], nextIndex: 2 });
    store.getState().onMessage({ type: 'telemetry-batch', events: [ev], nextIndex: 3 });
    expect(store.getState().events).toHaveLength(3);
    expect(store.getState().telemetryNextIndex).toBe(3);
  });

  it('collects snapshot chunks and registers the parsed snapshot on done', async () => {
    const { store, loadSnapshot } = makeStore();
    store.getState().onMessage({ type: 'snapshot-chunk', chunk: '{"a":' });
    store.getState().onMessage({ type: 'snapshot-chunk', chunk: '1}' });
    await store.getState().onMessage({ type: 'snapshot-done' });
    expect(loadSnapshot).toHaveBeenCalledWith(['{"a":', '1}']);
    const snaps = store.getState().snapshots;
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ id: 1, nodeCount: 42, time: 1000 });
    expect(store.getState().pendingChunks).toEqual([]);
  });

  it('imports a heap snapshot file as a single parser chunk', async () => {
    const { store, loadSnapshot } = makeStore();
    await store.getState().importSnapshot('baseline.heapsnapshot', '{"snapshot":true}');
    expect(loadSnapshot).toHaveBeenCalledWith(['{"snapshot":true}']);
    expect(store.getState().snapshots[0]).toMatchObject({
      id: 1,
      label: 'baseline.heapsnapshot',
      nodeCount: 42,
      totalSize: 17,
      time: 1000,
    });
    expect(store.getState().loadingSnapshot).toBe(false);
    expect(store.getState().pendingChunks).toEqual([]);
  });

  it('reports import failures without clearing streamed snapshot chunks', async () => {
    const { store, loadSnapshot } = makeStore();
    loadSnapshot.mockRejectedValueOnce(new Error('invalid snapshot json'));
    store.getState().onMessage({ type: 'snapshot-chunk', chunk: '{"partial":' });
    await store.getState().importSnapshot('', 'not json');
    expect(loadSnapshot).toHaveBeenCalledWith(['not json']);
    expect(store.getState().snapshots).toEqual([]);
    expect(store.getState().errors).toEqual(['import failed: invalid snapshot json']);
    expect(store.getState().loadingSnapshot).toBe(false);
    expect(store.getState().pendingChunks).toEqual(['{"partial":']);
  });

  it('sends attach/take-snapshot commands through the port', () => {
    const { store, posted } = makeStore();
    store.getState().attach();
    store.getState().takeSnapshot();
    expect(posted).toContainEqual({ type: 'attach' });
    expect(posted).toContainEqual({ type: 'take-snapshot' });
  });

  it('records errors for display', () => {
    const { store } = makeStore();
    store.getState().onMessage({ type: 'error', message: 'boom' });
    expect(store.getState().errors).toEqual(['boom']);
  });
});
