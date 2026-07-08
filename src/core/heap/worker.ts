/// <reference lib="webworker" />
import { createEngineState, handleOp, type Op } from './protocol';

interface WorkerRequest {
  id: number;
  op: Op;
}

const state = createEngineState();

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, op } = ev.data;
  try {
    const result = handleOp(state, op);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
