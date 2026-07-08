import type { LeakCandidate } from '@/shared/leak';
import type {
  AggregateResult,
  DetachedResult,
  NodesResult,
  RetainersResult,
  SummaryResult,
} from '@/core/heap/protocol';
import type { SnapshotDiffRow } from '@/core/heap/diff';
import type { TelemetryStore } from './telemetryStore';

export type Requirement = 'heap' | 'diff' | 'agent';

/**
 * Backend-agnostic heap query surface — implemented over the worker
 * (panel) or directly over the engine (Node e2e).
 */
export interface HeapQueryApi {
  summary(): Promise<SummaryResult>;
  aggregate(
    query: string | undefined,
    sort: 'retained' | 'shallow' | 'count',
    page: number,
    pageSize: number,
  ): Promise<AggregateResult>;
  nodes(constructorName: string, page: number, pageSize: number): Promise<NodesResult>;
  retainers(nodeId: number): Promise<RetainersResult>;
  detached(): Promise<DetachedResult>;
}

export interface DetectorContext {
  heap?: HeapQueryApi;
  /** Latest snapshot pair diff, present when >= 2 snapshots exist. */
  diff?: SnapshotDiffRow[];
  agent?: TelemetryStore;
}

export interface Detector {
  id: string;
  title: string;
  requires: Requirement[];
  analyze(ctx: DetectorContext): Promise<LeakCandidate[]>;
}

export interface DetectorRunResult {
  candidates: LeakCandidate[];
  unavailable: Array<{ id: string; title: string; missing: Requirement[] }>;
}
