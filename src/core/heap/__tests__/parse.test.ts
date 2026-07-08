import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { parseSnapshot } from '../parse';

function basicGraph(opts: { detachedness?: boolean } = {}) {
  const b = new SnapshotBuilder(opts);
  const root = b.node('', { type: 'synthetic', selfSize: 0 });
  const obj = b.node('Holder', { selfSize: 32 });
  const arr = b.node('Array', { type: 'array', selfSize: 64 });
  const div = b.node('Detached HTMLDivElement', {
    type: 'native',
    selfSize: 128,
    detachedness: opts.detachedness === false ? undefined : 2,
  });
  b.edge(root, obj, { name: 'holder' });
  b.edge(obj, arr, { name: 'items' });
  b.edge(obj, div, { name: 'savedNode' });
  b.edge(arr, div, { type: 'element', name: 0 });
  return { snapshot: b.build(), root, obj, arr, div };
}

describe('parseSnapshot', () => {
  it('parses nodes with names, types, ids and sizes', () => {
    const { snapshot, obj, div } = basicGraph();
    const g = parseSnapshot(snapshot);
    expect(g.nodeCount).toBe(4);
    expect(g.edgeCount).toBe(4);
    expect(g.nodeName(obj)).toBe('Holder');
    expect(g.nodeType(obj)).toBe('object');
    expect(g.nodeSelfSize(obj)).toBe(32);
    expect(g.nodeName(div)).toBe('Detached HTMLDivElement');
    expect(g.nodeType(div)).toBe('native');
    expect(g.nodeDetachedness(div)).toBe(2);
    expect(g.nodeId(obj)).toBeGreaterThan(0);
  });

  it('exposes outgoing edges with names and node-ordinal targets', () => {
    const { snapshot, obj, arr, div } = basicGraph();
    const g = parseSnapshot(snapshot);
    const first = g.firstEdge(obj);
    expect(g.edgeCountOf(obj)).toBe(2);
    expect(g.edgeName(first)).toBe('items');
    expect(g.edgeTarget(first)).toBe(arr);
    expect(g.edgeName(first + 1)).toBe('savedNode');
    expect(g.edgeTarget(first + 1)).toBe(div);
    expect(g.edgeType(first)).toBe('property');
    // element edge names are stringified indices
    const arrFirst = g.firstEdge(arr);
    expect(g.edgeType(arrFirst)).toBe('element');
    expect(g.edgeName(arrFirst)).toBe('0');
  });

  it('builds a correct inverse retainer index', () => {
    const { snapshot, obj, arr, div } = basicGraph();
    const g = parseSnapshot(snapshot);
    const retainers = g.retainersOf(div).map((r) => r.node);
    expect(retainers).toHaveLength(2);
    expect(retainers).toContain(obj);
    expect(retainers).toContain(arr);
    // and each retainer entry points at an edge whose target is div
    for (const r of g.retainersOf(div)) {
      expect(g.edgeTarget(r.edge)).toBe(div);
    }
  });

  it('handles snapshots without a detachedness field', () => {
    const { snapshot, div } = basicGraph({ detachedness: false });
    const g = parseSnapshot(snapshot);
    expect(g.nodeDetachedness(div)).toBe(0);
    expect(g.nodeName(div)).toBe('Detached HTMLDivElement');
  });
});
