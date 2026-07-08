/**
 * V8 heap snapshot JSON format (the exact format Chrome DevTools consumes).
 * Column layouts are declared in snapshot.meta and must be read dynamically —
 * Chrome has added fields (e.g. detachedness) over time.
 */
export interface V8SnapshotMeta {
  node_fields: string[];
  node_types: [string[], ...string[]];
  edge_fields: string[];
  edge_types: [string[], ...string[]];
  [key: string]: unknown;
}

export interface V8Snapshot {
  snapshot: {
    meta: V8SnapshotMeta;
    node_count: number;
    edge_count: number;
    [key: string]: unknown;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
  [key: string]: unknown;
}

/** detachedness values V8 emits on DOM-ish nodes. */
export const DETACHED = 2;
export const ATTACHED = 1;
export const UNKNOWN_DETACHEDNESS = 0;
