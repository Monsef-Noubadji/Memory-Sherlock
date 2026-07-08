import { DETACHED } from './format';
import type { HeapGraph } from './parse';

export interface DetachedSubtree {
  /** Ordinal of the subtree's top node (no detached retainer). */
  representative: number;
  /** All detached ordinals in this cluster, representative included. */
  nodes: number[];
  retainedBytes: number;
}

export function isDetachedNode(g: HeapGraph, i: number): boolean {
  if (g.nodeDetachedness(i) === DETACHED) return true;
  return g.nodeType(i) === 'native' && g.nodeName(i).startsWith('Detached ');
}

/**
 * Finds detached DOM nodes and clusters them into subtrees. A node is a
 * cluster representative when none of its retainers is itself detached.
 * retainedBytes uses the representative's retained size when available,
 * otherwise the cluster's summed self sizes.
 */
export function findDetachedDom(g: HeapGraph): DetachedSubtree[] {
  const detached = new Set<number>();
  for (let i = 0; i < g.nodeCount; i++) {
    if (isDetachedNode(g, i)) detached.add(i);
  }
  if (detached.size === 0) return [];

  const reps: number[] = [];
  for (const i of detached) {
    const hasDetachedRetainer = g.retainersOf(i).some((r) => detached.has(r.node));
    if (!hasDetachedRetainer) reps.push(i);
  }

  const claimed = new Set<number>();
  const subtrees: DetachedSubtree[] = [];
  for (const rep of reps) {
    if (claimed.has(rep)) continue;
    const cluster: number[] = [];
    const queue = [rep];
    claimed.add(rep);
    while (queue.length) {
      const u = queue.pop()!;
      cluster.push(u);
      const first = g.firstEdge(u);
      const last = first + g.edgeCountOf(u);
      for (let e = first; e < last; e++) {
        const v = g.edgeTarget(e);
        if (detached.has(v) && !claimed.has(v)) {
          claimed.add(v);
          queue.push(v);
        }
      }
    }
    const retainedBytes = g.retained
      ? g.retained[rep]
      : cluster.reduce((sum, n) => sum + g.nodeSelfSize(n), 0);
    subtrees.push({ representative: rep, nodes: cluster, retainedBytes });
  }
  subtrees.sort((a, b) => b.retainedBytes - a.retainedBytes);
  return subtrees;
}
