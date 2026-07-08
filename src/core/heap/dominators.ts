import type { HeapGraph } from './parse';

/**
 * Retained sizes via dominator tree (Cooper–Harvey–Kennedy iterative
 * algorithm — the same approach Chrome DevTools uses). Weak edges are
 * non-owning: they contribute neither reachability nor domination.
 * Nodes not strongly reachable from the root keep retained == selfSize.
 */
export function computeRetainedSizes(g: HeapGraph): Float64Array {
  const n = g.nodeCount;
  const ROOT = 0;

  // BFS from root over strong edges. BFS numbering has the property that a
  // node's immediate dominator always has a smaller index (every root-path,
  // including the shortest, passes through the dominator), which is what
  // intersect() below relies on.
  const bfsIndex = new Int32Array(n).fill(-1);
  const bfsOrder = new Int32Array(n);
  let count = 0;
  if (n > 0) {
    bfsIndex[ROOT] = 0;
    bfsOrder[0] = ROOT;
    count = 1;
    for (let q = 0; q < count; q++) {
      const u = bfsOrder[q];
      const first = g.firstEdge(u);
      const last = first + g.edgeCountOf(u);
      for (let e = first; e < last; e++) {
        if (g.edgeIsWeak(e)) continue;
        const v = g.edgeTarget(e);
        if (bfsIndex[v] < 0) {
          bfsIndex[v] = count;
          bfsOrder[count++] = v;
        }
      }
    }
  }

  // doms in BFS-index space
  const doms = new Int32Array(count).fill(-1);
  if (count > 0) doms[0] = 0;

  const intersect = (a: number, b: number): number => {
    while (a !== b) {
      while (a > b) a = doms[a];
      while (b > a) b = doms[b];
    }
    return a;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 1; k < count; k++) {
      const v = bfsOrder[k];
      let newIdom = -1;
      for (const { node: r, edge } of g.retainersOf(v)) {
        if (g.edgeIsWeak(edge)) continue;
        const rk = bfsIndex[r];
        if (rk < 0) continue; // retainer not strongly reachable
        if (doms[rk] === -1) continue; // not yet processed
        newIdom = newIdom < 0 ? rk : intersect(newIdom, rk);
      }
      if (newIdom >= 0 && doms[k] !== newIdom) {
        doms[k] = newIdom;
        changed = true;
      }
    }
  }

  // Accumulate retained sizes bottom-up: processing in decreasing BFS index
  // guarantees children are folded into parents before parents are folded.
  const retained = new Float64Array(n);
  for (let i = 0; i < n; i++) retained[i] = g.nodeSelfSize(i);
  for (let k = count - 1; k >= 1; k--) {
    const v = bfsOrder[k];
    const d = bfsOrder[doms[k]];
    retained[d] += retained[v];
  }
  g.retained = retained;
  return retained;
}
