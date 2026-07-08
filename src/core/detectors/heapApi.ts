import { handleOp, type EngineState } from '@/core/heap/protocol';
import type { HeapQueryApi } from './types';
import type { HeapClient } from '@/core/heap/HeapClient';

/** HeapQueryApi over an in-process engine (Node e2e, tests). */
export function heapApiFromEngine(state: EngineState, snapshotId: number): HeapQueryApi {
  return {
    summary: async () => handleOp(state, { op: 'summary', snapshotId }),
    aggregate: async (query, sort, page, pageSize) =>
      handleOp(state, { op: 'aggregate', snapshotId, query, sort, page, pageSize }),
    nodes: async (constructorName, page, pageSize) =>
      handleOp(state, { op: 'nodes', snapshotId, constructorName, page, pageSize }),
    retainers: async (nodeId) => handleOp(state, { op: 'retainers', snapshotId, nodeId }),
    detached: async () => handleOp(state, { op: 'detached', snapshotId }),
  };
}

/** HeapQueryApi over the panel's worker client. */
export function heapApiFromClient(client: HeapClient, snapshotId: number): HeapQueryApi {
  return {
    summary: () => client.request({ op: 'summary', snapshotId }),
    aggregate: (query, sort, page, pageSize) =>
      client.request({ op: 'aggregate', snapshotId, query, sort, page, pageSize }),
    nodes: (constructorName, page, pageSize) =>
      client.request({ op: 'nodes', snapshotId, constructorName, page, pageSize }),
    retainers: (nodeId) => client.request({ op: 'retainers', snapshotId, nodeId }),
    detached: () => client.request({ op: 'detached', snapshotId }),
  };
}
