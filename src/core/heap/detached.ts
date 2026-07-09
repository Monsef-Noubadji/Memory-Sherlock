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

  // Cluster detached nodes into connected components over undirected
  // detached↔detached references. Real detached DOM forms cycles (parent↔
  // child, element↔attribute), so a "node with no detached retainer" test
  // finds no representatives — components are the robust grouping.
  const claimed = new Set<number>();
  const subtrees: DetachedSubtree[] = [];

  const neighbors = (u: number, out: number[]) => {
    const first = g.firstEdge(u);
    const last = first + g.edgeCountOf(u);
    for (let e = first; e < last; e++) {
      const v = g.edgeTarget(e);
      if (detached.has(v)) out.push(v);
    }
    for (const r of g.retainersOf(u)) {
      if (detached.has(r.node)) out.push(r.node);
    }
  };

  for (const start of detached) {
    if (claimed.has(start)) continue;
    const cluster: number[] = [];
    const queue = [start];
    claimed.add(start);
    const buf: number[] = [];
    while (queue.length) {
      const u = queue.pop()!;
      cluster.push(u);
      buf.length = 0;
      neighbors(u, buf);
      for (const v of buf) {
        if (!claimed.has(v)) {
          claimed.add(v);
          queue.push(v);
        }
      }
    }
    // representative = the top-retained node in the component
    let rep = cluster[0];
    let repRetained = g.retained ? g.retained[rep] : g.nodeSelfSize(rep);
    for (const n of cluster) {
      const r = g.retained ? g.retained[n] : g.nodeSelfSize(n);
      if (r > repRetained) {
        rep = n;
        repRetained = r;
      }
    }
    const retainedBytes = cluster.reduce((sum, n) => sum + g.nodeSelfSize(n), 0);
    subtrees.push({ representative: rep, nodes: cluster, retainedBytes });
  }
  subtrees.sort((a, b) => b.retainedBytes - a.retainedBytes);
  return subtrees;
}
