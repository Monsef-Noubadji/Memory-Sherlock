import type { V8Snapshot } from '../format';

export interface FixtureNodeOpts {
  type?: string;
  selfSize?: number;
  detachedness?: number;
  id?: number;
}

export interface FixtureEdgeOpts {
  type?: string;
  name?: string | number;
}

const NODE_TYPES = [
  'hidden',
  'array',
  'string',
  'object',
  'code',
  'closure',
  'regexp',
  'number',
  'native',
  'synthetic',
  'concatenated string',
  'sliced string',
  'symbol',
  'bigint',
] as const;

const EDGE_TYPES = ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'] as const;

const NODE_FIELDS = ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'];
const EDGE_FIELDS = ['type', 'name_or_index', 'to_node'];

interface PendingNode {
  type: number;
  name: number;
  id: number;
  selfSize: number;
  detachedness: number;
  edges: Array<{ type: number; nameOrIndex: number; to: number }>;
}

/**
 * Builds tiny but structurally valid V8 heap snapshots for tests.
 * The first node created is treated as the GC root (matching V8, whose
 * ordinal-0 node is the synthetic root).
 */
export class SnapshotBuilder {
  private nodes: PendingNode[] = [];
  private strings: string[] = [];
  private includeDetachedness: boolean;

  constructor(opts: { detachedness?: boolean } = {}) {
    this.includeDetachedness = opts.detachedness !== false;
  }

  private str(s: string): number {
    const i = this.strings.indexOf(s);
    if (i >= 0) return i;
    this.strings.push(s);
    return this.strings.length - 1;
  }

  node(name: string, opts: FixtureNodeOpts = {}): number {
    const typeIdx = NODE_TYPES.indexOf((opts.type ?? 'object') as (typeof NODE_TYPES)[number]);
    if (typeIdx < 0) throw new Error(`unknown node type ${opts.type}`);
    this.nodes.push({
      type: typeIdx,
      name: this.str(name),
      id: opts.id ?? this.nodes.length * 2 + 1,
      selfSize: opts.selfSize ?? 16,
      detachedness: opts.detachedness ?? 0,
      edges: [],
    });
    return this.nodes.length - 1;
  }

  edge(from: number, to: number, opts: FixtureEdgeOpts = {}): void {
    const type = (opts.type ?? 'property') as (typeof EDGE_TYPES)[number];
    const typeIdx = EDGE_TYPES.indexOf(type);
    if (typeIdx < 0) throw new Error(`unknown edge type ${opts.type}`);
    const name = opts.name ?? 'ref';
    const nameOrIndex =
      type === 'element' || type === 'hidden'
        ? typeof name === 'number'
          ? name
          : 0
        : this.str(String(name));
    this.nodes[from].edges.push({ type: typeIdx, nameOrIndex, to });
  }

  build(): V8Snapshot {
    const nodeFields = this.includeDetachedness ? NODE_FIELDS : NODE_FIELDS.slice(0, 6);
    const nodeFieldCount = nodeFields.length;
    const nodes: number[] = [];
    const edges: number[] = [];
    for (const n of this.nodes) {
      nodes.push(n.type, n.name, n.id, n.selfSize, n.edges.length, 0);
      if (this.includeDetachedness) nodes.push(n.detachedness);
      for (const e of n.edges) {
        edges.push(e.type, e.nameOrIndex, e.to * nodeFieldCount);
      }
    }
    return {
      snapshot: {
        meta: {
          node_fields: nodeFields,
          node_types: [
            [...NODE_TYPES],
            'string',
            'number',
            'number',
            'number',
            'number',
            ...(this.includeDetachedness ? ['number'] : []),
          ],
          edge_fields: EDGE_FIELDS,
          edge_types: [[...EDGE_TYPES], 'string_or_number', 'node'],
        },
        node_count: this.nodes.length,
        edge_count: edges.length / EDGE_FIELDS.length,
      },
      nodes,
      edges,
      strings: [...this.strings],
    };
  }
}
