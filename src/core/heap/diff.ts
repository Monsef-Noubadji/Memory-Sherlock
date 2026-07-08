import { keyForNode } from './aggregate';
import type { HeapGraph } from './parse';

export interface SnapshotDiffRow {
  name: string;
  addedCount: number;
  removedCount: number;
  countDelta: number;
  sizeDelta: number;
}

/**
 * Diff by constructor, matching instances by V8 node id (stable across
 * snapshots of the same page session).
 */
export function diffSnapshots(before: HeapGraph, after: HeapGraph): SnapshotDiffRow[] {
  const index = (g: HeapGraph) => {
    const m = new Map<string, Map<number, number>>(); // key -> id -> selfSize
    for (let i = 0; i < g.nodeCount; i++) {
      const key = keyForNode(g, i);
      let ids = m.get(key);
      if (!ids) {
        ids = new Map();
        m.set(key, ids);
      }
      ids.set(g.nodeId(i), g.nodeSelfSize(i));
    }
    return m;
  };
  const b = index(before);
  const a = index(after);
  const keys = new Set([...b.keys(), ...a.keys()]);
  const rows: SnapshotDiffRow[] = [];
  for (const key of keys) {
    const beforeIds = b.get(key) ?? new Map<number, number>();
    const afterIds = a.get(key) ?? new Map<number, number>();
    let addedCount = 0;
    let removedCount = 0;
    let beforeSize = 0;
    let afterSize = 0;
    for (const [id, size] of afterIds) {
      afterSize += size;
      if (!beforeIds.has(id)) addedCount++;
    }
    for (const [id, size] of beforeIds) {
      beforeSize += size;
      if (!afterIds.has(id)) removedCount++;
    }
    const countDelta = afterIds.size - beforeIds.size;
    const sizeDelta = afterSize - beforeSize;
    if (addedCount || removedCount || countDelta || sizeDelta) {
      rows.push({ name: key, addedCount, removedCount, countDelta, sizeDelta });
    }
  }
  rows.sort((x, y) => y.sizeDelta - x.sizeDelta);
  return rows;
}
