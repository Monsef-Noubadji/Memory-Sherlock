import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { createEngineState, handleOp, type EngineState } from '../protocol';

function chunksFor(builder: SnapshotBuilder): string[] {
  const json = JSON.stringify(builder.build());
  const mid = Math.floor(json.length / 2);
  return [json.slice(0, mid), json.slice(mid)];
}

function leakyBuilder(extraEntries: number): SnapshotBuilder {
  const b = new SnapshotBuilder();
  const root = b.node('', { type: 'synthetic', selfSize: 0 });
  const store = b.node('LeakStore', { selfSize: 16, id: 3 });
  b.edge(root, store, { name: 'store' });
  const div = b.node('Detached HTMLDivElement', { type: 'native', selfSize: 256, detachedness: 2, id: 5 });
  b.edge(store, div, { name: 'savedNode' });
  for (let i = 0; i < extraEntries; i++) {
    const e = b.node('CacheEntry', { selfSize: 64, id: 101 + i * 2 });
    b.edge(store, e, { name: `entry${i}` });
  }
  return b;
}

describe('heap engine protocol', () => {
  let state: EngineState;
  beforeEach(() => {
    state = createEngineState();
  });

  it('loads chunked snapshots and reports a summary', () => {
    const load = handleOp(state, { op: 'load', chunks: chunksFor(leakyBuilder(2)) });
    expect(load.snapshotId).toBe(1);
    expect(load.nodeCount).toBe(5);
    const summary = handleOp(state, { op: 'summary', snapshotId: 1 });
    expect(summary.nodeCount).toBe(5);
    expect(summary.totalSize).toBe(16 + 256 + 128);
    expect(summary.detachedCount).toBe(1);
    expect(summary.topConstructors.length).toBeGreaterThan(0);
  });

  it('aggregates with search and paging', () => {
    handleOp(state, { op: 'load', chunks: chunksFor(leakyBuilder(3)) });
    const res = handleOp(state, {
      op: 'aggregate',
      snapshotId: 1,
      query: 'cache',
      sort: 'shallow',
      page: 0,
      pageSize: 10,
    });
    expect(res.total).toBe(1);
    expect(res.rows[0].name).toBe('CacheEntry');
    expect(res.rows[0].count).toBe(3);
  });

  it('lists nodes for a constructor and resolves retainer paths', () => {
    handleOp(state, { op: 'load', chunks: chunksFor(leakyBuilder(0)) });
    const nodes = handleOp(state, {
      op: 'nodes',
      snapshotId: 1,
      constructorName: 'Detached HTMLDivElement',
      page: 0,
      pageSize: 10,
    });
    expect(nodes.total).toBe(1);
    const ret = handleOp(state, { op: 'retainers', snapshotId: 1, nodeId: nodes.rows[0].id });
    expect(ret.path.map((s) => s.nodeName)).toEqual(['Detached HTMLDivElement', 'LeakStore', '']);
    expect(ret.path[1].edgeName).toBe('savedNode');
  });

  it('reports detached subtrees', () => {
    handleOp(state, { op: 'load', chunks: chunksFor(leakyBuilder(0)) });
    const det = handleOp(state, { op: 'detached', snapshotId: 1 });
    expect(det.subtrees).toHaveLength(1);
    expect(det.subtrees[0].representative.name).toBe('Detached HTMLDivElement');
    expect(det.subtrees[0].retainedBytes).toBe(256);
  });

  it('diffs two snapshots', () => {
    handleOp(state, { op: 'load', chunks: chunksFor(leakyBuilder(1)) });
    handleOp(state, { op: 'load', chunks: chunksFor(leakyBuilder(4)) });
    const diff = handleOp(state, { op: 'diff', beforeId: 1, afterId: 2, page: 0, pageSize: 10 });
    const cache = diff.rows.find((r) => r.name === 'CacheEntry')!;
    expect(cache.addedCount).toBe(3);
    expect(cache.countDelta).toBe(3);
  });

  it('throws a clear error for an unknown snapshot id', () => {
    expect(() => handleOp(state, { op: 'summary', snapshotId: 99 })).toThrow(/snapshot 99/i);
  });
});
