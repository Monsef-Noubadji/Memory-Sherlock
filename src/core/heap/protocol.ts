import { aggregateByConstructor, keyForNode, type ConstructorAggregate } from './aggregate';
import { computeRetainedSizes } from './dominators';
import { diffSnapshots, type SnapshotDiffRow } from './diff';
import { findDetachedDom } from './detached';
import { parseSnapshotChunks, type HeapGraph } from './parse';
import { shortestRetainerPath } from './paths';
import type { RetainerStep } from '@/shared/leak';

export type Op =
  | { op: 'load'; chunks: string[]; label?: string }
  | { op: 'aggregate'; snapshotId: number; query?: string; sort: 'retained' | 'shallow' | 'count'; page: number; pageSize: number }
  | { op: 'nodes'; snapshotId: number; constructorName: string; page: number; pageSize: number }
  | { op: 'retainers'; snapshotId: number; nodeId: number }
  | { op: 'detached'; snapshotId: number }
  | { op: 'diff'; beforeId: number; afterId: number; page: number; pageSize: number }
  | { op: 'summary'; snapshotId: number };

export interface NodeRow {
  ordinal: number;
  id: number;
  name: string;
  type: string;
  selfSize: number;
  retained: number;
}

export interface AggregateRow {
  name: string;
  count: number;
  shallow: number;
  retained: number;
}

export interface LoadResult { snapshotId: number; nodeCount: number; totalSize: number; }
export interface AggregateResult { rows: AggregateRow[]; total: number; }
export interface NodesResult { rows: NodeRow[]; total: number; }
export interface RetainersResult {
  path: RetainerStep[];
  retainers: Array<{ name: string; id: number; edgeName: string; type: string }>;
}
export interface DetachedSubtreeRow {
  representative: NodeRow;
  count: number;
  retainedBytes: number;
  childNames: string[];
}
export interface DetachedResult { subtrees: DetachedSubtreeRow[]; }
export interface DiffResult { rows: SnapshotDiffRow[]; total: number; }
export interface SummaryResult {
  nodeCount: number;
  totalSize: number;
  detachedCount: number;
  topConstructors: AggregateRow[];
}

export type ResultFor<O extends Op> = O extends { op: 'load' }
  ? LoadResult
  : O extends { op: 'aggregate' }
    ? AggregateResult
    : O extends { op: 'nodes' }
      ? NodesResult
      : O extends { op: 'retainers' }
        ? RetainersResult
        : O extends { op: 'detached' }
          ? DetachedResult
          : O extends { op: 'diff' }
            ? DiffResult
            : SummaryResult;

interface LoadedSnapshot {
  graph: HeapGraph;
  aggregates: ConstructorAggregate[];
}

export interface EngineState {
  snapshots: Map<number, LoadedSnapshot>;
  nextId: number;
}

export function createEngineState(): EngineState {
  return { snapshots: new Map(), nextId: 1 };
}

function snap(state: EngineState, id: number): LoadedSnapshot {
  const s = state.snapshots.get(id);
  if (!s) throw new Error(`snapshot ${id} is not loaded`);
  return s;
}

function nodeRow(g: HeapGraph, ordinal: number): NodeRow {
  return {
    ordinal,
    id: g.nodeId(ordinal),
    name: g.nodeName(ordinal),
    type: g.nodeType(ordinal),
    selfSize: g.nodeSelfSize(ordinal),
    retained: g.retained ? g.retained[ordinal] : 0,
  };
}

function page<T>(rows: T[], pageNum: number, pageSize: number): { rows: T[]; total: number } {
  return { rows: rows.slice(pageNum * pageSize, (pageNum + 1) * pageSize), total: rows.length };
}

export function handleOp<O extends Op>(state: EngineState, op: O): ResultFor<O> {
  switch (op.op) {
    case 'load': {
      const graph = parseSnapshotChunks(op.chunks);
      computeRetainedSizes(graph);
      const id = state.nextId++;
      state.snapshots.set(id, { graph, aggregates: aggregateByConstructor(graph) });
      return {
        snapshotId: id,
        nodeCount: graph.nodeCount,
        totalSize: graph.totalSize,
      } satisfies LoadResult as ResultFor<O>;
    }
    case 'aggregate': {
      const { aggregates } = snap(state, op.snapshotId);
      let rows = aggregates;
      if (op.query) {
        const q = op.query.toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(q));
      }
      const sorted = [...rows].sort((a, b) => b[op.sort] - a[op.sort]);
      const paged = page(sorted, op.page, op.pageSize);
      return {
        rows: paged.rows.map(({ name, count, shallow, retained }) => ({ name, count, shallow, retained })),
        total: paged.total,
      } satisfies AggregateResult as ResultFor<O>;
    }
    case 'nodes': {
      const { graph } = snap(state, op.snapshotId);
      const ordinals: number[] = [];
      for (let i = 0; i < graph.nodeCount; i++) {
        if (keyForNode(graph, i) === op.constructorName) ordinals.push(i);
      }
      const sorted = ordinals.map((i) => nodeRow(graph, i)).sort((a, b) => b.retained - a.retained);
      const paged = page(sorted, op.page, op.pageSize);
      return { rows: paged.rows, total: paged.total } satisfies NodesResult as ResultFor<O>;
    }
    case 'retainers': {
      const { graph } = snap(state, op.snapshotId);
      const ordinal = graph.ordinalForId(op.nodeId);
      if (ordinal === undefined) throw new Error(`node id ${op.nodeId} not found`);
      const path = shortestRetainerPath(graph, ordinal);
      const retainers = graph.retainersOf(ordinal).map((r) => ({
        name: graph.nodeName(r.node),
        id: graph.nodeId(r.node),
        edgeName: graph.edgeName(r.edge),
        type: graph.nodeType(r.node),
      }));
      return { path, retainers } satisfies RetainersResult as ResultFor<O>;
    }
    case 'detached': {
      const { graph } = snap(state, op.snapshotId);
      const subtrees = findDetachedDom(graph).map((s) => ({
        representative: nodeRow(graph, s.representative),
        count: s.nodes.length,
        retainedBytes: s.retainedBytes,
        childNames: s.nodes
          .filter((n) => n !== s.representative)
          .slice(0, 10)
          .map((n) => graph.nodeName(n)),
      }));
      return { subtrees } satisfies DetachedResult as ResultFor<O>;
    }
    case 'diff': {
      const before = snap(state, op.beforeId).graph;
      const after = snap(state, op.afterId).graph;
      const paged = page(diffSnapshots(before, after), op.page, op.pageSize);
      return { rows: paged.rows, total: paged.total } satisfies DiffResult as ResultFor<O>;
    }
    case 'summary': {
      const { graph, aggregates } = snap(state, op.snapshotId);
      const detachedCount = findDetachedDom(graph).length;
      return {
        nodeCount: graph.nodeCount,
        totalSize: graph.totalSize,
        detachedCount,
        topConstructors: aggregates
          .slice(0, 10)
          .map(({ name, count, shallow, retained }) => ({ name, count, shallow, retained })),
      } satisfies SummaryResult as ResultFor<O>;
    }
  }
}
