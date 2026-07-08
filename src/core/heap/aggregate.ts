import type { HeapGraph } from './parse';

export interface ConstructorAggregate {
  name: string;
  count: number;
  shallow: number;
  retained: number;
  sampleNodes: number[];
}

const MAX_SAMPLES = 5;

/** Grouping key per node, mirroring DevTools' constructor grouping. */
export function keyForNode(g: HeapGraph, i: number): string {
  const type = g.nodeType(i);
  switch (type) {
    case 'object':
    case 'native':
    case 'array':
      return g.nodeName(i) || `(${type})`;
    case 'closure':
      return g.nodeName(i) ? `${g.nodeName(i)}()` : '(closure)';
    case 'string':
    case 'concatenated string':
    case 'sliced string':
      return '(string)';
    case 'code':
      return '(compiled code)';
    default:
      return `(${type})`;
  }
}

export function aggregateByConstructor(g: HeapGraph): ConstructorAggregate[] {
  const byName = new Map<string, ConstructorAggregate>();
  for (let i = 0; i < g.nodeCount; i++) {
    const key = keyForNode(g, i);
    let agg = byName.get(key);
    if (!agg) {
      agg = { name: key, count: 0, shallow: 0, retained: 0, sampleNodes: [] };
      byName.set(key, agg);
    }
    agg.count++;
    agg.shallow += g.nodeSelfSize(i);
    agg.retained += g.retained ? g.retained[i] : 0;
    if (agg.sampleNodes.length < MAX_SAMPLES) agg.sampleNodes.push(i);
  }
  return [...byName.values()].sort((a, b) => b.retained - a.retained || b.shallow - a.shallow);
}
