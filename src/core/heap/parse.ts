import type { V8Snapshot } from './format';

/**
 * Columnar heap graph — the same layout Chrome DevTools uses internally.
 * Node/edge data stays in typed arrays; accessors decode on demand.
 * Edge targets are node ordinals (byte offsets are converted at parse time).
 */
export class HeapGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  /** Total self size of all nodes (== heap size). */
  readonly totalSize: number;
  /** Filled by computeRetainedSizes (dominators.ts); null until then. */
  retained: Float64Array | null = null;

  private readonly nodes: Int32Array;
  private readonly edges: Int32Array;
  private readonly strings: string[];
  private readonly nodeFieldCount: number;
  private readonly edgeFieldCount: number;
  private readonly nodeTypeNames: string[];
  private readonly edgeTypeNames: string[];
  // node field offsets
  private readonly oType: number;
  private readonly oName: number;
  private readonly oId: number;
  private readonly oSelfSize: number;
  private readonly oEdgeCount: number;
  private readonly oDetachedness: number; // -1 if absent
  // edge field offsets
  private readonly oEdgeType: number;
  private readonly oEdgeName: number;
  private readonly oEdgeTo: number;
  private readonly elementEdgeType: number;
  private readonly hiddenEdgeType: number;
  readonly weakEdgeType: number;

  /** firstEdgeIdx[i] = ordinal of node i's first edge; length nodeCount+1. */
  private readonly firstEdgeIdx: Uint32Array;
  // inverse index
  private readonly retainerFirst: Uint32Array; // length nodeCount+1
  private readonly retainerNode: Uint32Array; // retaining node ordinal
  private readonly retainerEdge: Uint32Array; // retaining edge ordinal

  private readonly idToOrdinal: Map<number, number>;

  constructor(json: V8Snapshot) {
    const meta = json.snapshot.meta;
    const nf = meta.node_fields;
    const ef = meta.edge_fields;
    this.nodeFieldCount = nf.length;
    this.edgeFieldCount = ef.length;
    this.oType = nf.indexOf('type');
    this.oName = nf.indexOf('name');
    this.oId = nf.indexOf('id');
    this.oSelfSize = nf.indexOf('self_size');
    this.oEdgeCount = nf.indexOf('edge_count');
    this.oDetachedness = nf.indexOf('detachedness');
    this.oEdgeType = ef.indexOf('type');
    this.oEdgeName = ef.indexOf('name_or_index');
    this.oEdgeTo = ef.indexOf('to_node');
    this.nodeTypeNames = meta.node_types[0];
    this.edgeTypeNames = meta.edge_types[0];
    this.elementEdgeType = this.edgeTypeNames.indexOf('element');
    this.hiddenEdgeType = this.edgeTypeNames.indexOf('hidden');
    this.weakEdgeType = this.edgeTypeNames.indexOf('weak');

    this.nodes = Int32Array.from(json.nodes);
    this.edges = Int32Array.from(json.edges);
    this.strings = json.strings;
    this.nodeCount = this.nodes.length / this.nodeFieldCount;
    this.edgeCount = this.edges.length / this.edgeFieldCount;

    // convert to_node byte offsets -> node ordinals
    for (let e = 0; e < this.edgeCount; e++) {
      const idx = e * this.edgeFieldCount + this.oEdgeTo;
      this.edges[idx] = this.edges[idx] / this.nodeFieldCount;
    }

    // prefix-sum first edge index
    this.firstEdgeIdx = new Uint32Array(this.nodeCount + 1);
    let acc = 0;
    for (let i = 0; i < this.nodeCount; i++) {
      this.firstEdgeIdx[i] = acc;
      acc += this.nodes[i * this.nodeFieldCount + this.oEdgeCount];
    }
    this.firstEdgeIdx[this.nodeCount] = acc;

    // inverse retainer index via counting sort by edge target
    const counts = new Uint32Array(this.nodeCount + 1);
    for (let e = 0; e < this.edgeCount; e++) {
      counts[this.edgeTarget(e) + 1]++;
    }
    for (let i = 0; i < this.nodeCount; i++) counts[i + 1] += counts[i];
    this.retainerFirst = counts;
    this.retainerNode = new Uint32Array(this.edgeCount);
    this.retainerEdge = new Uint32Array(this.edgeCount);
    const cursor = Uint32Array.from(counts.subarray(0, this.nodeCount));
    for (let n = 0; n < this.nodeCount; n++) {
      const first = this.firstEdgeIdx[n];
      const last = this.firstEdgeIdx[n + 1];
      for (let e = first; e < last; e++) {
        const t = this.edgeTarget(e);
        const slot = cursor[t]++;
        this.retainerNode[slot] = n;
        this.retainerEdge[slot] = e;
      }
    }

    let total = 0;
    this.idToOrdinal = new Map();
    for (let i = 0; i < this.nodeCount; i++) {
      total += this.nodeSelfSize(i);
      this.idToOrdinal.set(this.nodeId(i), i);
    }
    this.totalSize = total;
  }

  nodeType(i: number): string {
    return this.nodeTypeNames[this.nodes[i * this.nodeFieldCount + this.oType]];
  }
  nodeName(i: number): string {
    return this.strings[this.nodes[i * this.nodeFieldCount + this.oName]] ?? '';
  }
  nodeId(i: number): number {
    return this.nodes[i * this.nodeFieldCount + this.oId];
  }
  nodeSelfSize(i: number): number {
    return this.nodes[i * this.nodeFieldCount + this.oSelfSize];
  }
  nodeDetachedness(i: number): number {
    if (this.oDetachedness < 0) return 0;
    return this.nodes[i * this.nodeFieldCount + this.oDetachedness];
  }
  ordinalForId(id: number): number | undefined {
    return this.idToOrdinal.get(id);
  }

  firstEdge(i: number): number {
    return this.firstEdgeIdx[i];
  }
  edgeCountOf(i: number): number {
    return this.firstEdgeIdx[i + 1] - this.firstEdgeIdx[i];
  }
  edgeType(e: number): string {
    return this.edgeTypeNames[this.edges[e * this.edgeFieldCount + this.oEdgeType]];
  }
  edgeIsWeak(e: number): boolean {
    return this.edges[e * this.edgeFieldCount + this.oEdgeType] === this.weakEdgeType;
  }
  edgeName(e: number): string {
    const raw = this.edges[e * this.edgeFieldCount + this.oEdgeName];
    const t = this.edges[e * this.edgeFieldCount + this.oEdgeType];
    if (t === this.elementEdgeType || t === this.hiddenEdgeType) return String(raw);
    return this.strings[raw] ?? String(raw);
  }
  edgeTarget(e: number): number {
    return this.edges[e * this.edgeFieldCount + this.oEdgeTo];
  }

  retainersOf(i: number): Array<{ node: number; edge: number }> {
    const out: Array<{ node: number; edge: number }> = [];
    for (let s = this.retainerFirst[i]; s < this.retainerFirst[i + 1]; s++) {
      out.push({ node: this.retainerNode[s], edge: this.retainerEdge[s] });
    }
    return out;
  }

  retainedSize(i: number): number {
    if (!this.retained) throw new Error('retained sizes not computed — call computeRetainedSizes first');
    return this.retained[i];
  }
}

export function parseSnapshot(json: V8Snapshot): HeapGraph {
  return new HeapGraph(json);
}

/** Parse a snapshot delivered as CDP chunk strings. */
export function parseSnapshotChunks(chunks: string[]): HeapGraph {
  return parseSnapshot(JSON.parse(chunks.join('')) as V8Snapshot);
}
