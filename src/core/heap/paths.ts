import type { HeapGraph } from './parse';
import type { RetainerStep } from '@/shared/leak';

/**
 * Shortest strong retainer path from `node` back to the GC root (ordinal 0),
 * via reverse BFS over the retainer index, skipping weak edges.
 *
 * Result: steps[0] is the node itself (edgeName '');
 * steps[k] is a retainer, and steps[k].edgeName names the edge from that
 * retainer into steps[k-1]'s node. Returns [] if no strong path exists.
 */
export function shortestRetainerPath(g: HeapGraph, node: number, maxLen = 32): RetainerStep[] {
  const ROOT = 0;
  if (node === ROOT) return [step(g, ROOT, '')];

  const visited = new Set<number>([node]);
  // parent[r] = the node r retains on the path, and the edge used
  const parent = new Map<number, { child: number; edge: number }>();
  let frontier = [node];
  let found = false;
  for (let depth = 0; depth < maxLen && frontier.length > 0 && !found; depth++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (const { node: r, edge } of g.retainersOf(u)) {
        if (g.edgeIsWeak(edge)) continue;
        if (visited.has(r)) continue;
        visited.add(r);
        parent.set(r, { child: u, edge });
        if (r === ROOT) {
          found = true;
          break;
        }
        next.push(r);
      }
      if (found) break;
    }
    frontier = next;
  }
  if (!found) return [];

  // Reconstruct root -> ... -> node, then emit node-first.
  const chain: Array<{ node: number; edgeIntoChild: number }> = [];
  let cur = ROOT;
  while (cur !== node) {
    const p = parent.get(cur)!;
    chain.push({ node: cur, edgeIntoChild: p.edge });
    cur = p.child;
  }
  const steps: RetainerStep[] = [step(g, node, '')];
  for (let i = chain.length - 1; i >= 0; i--) {
    steps.push(step(g, chain[i].node, g.edgeName(chain[i].edgeIntoChild)));
  }
  return steps;
}

function step(g: HeapGraph, node: number, edgeName: string): RetainerStep {
  return {
    nodeName: g.nodeName(node),
    nodeId: g.nodeId(node),
    edgeName,
    nodeType: g.nodeType(node),
  };
}
