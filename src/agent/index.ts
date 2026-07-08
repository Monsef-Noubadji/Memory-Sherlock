import { installAgent } from './instrument';
import type { AgentMessage } from '@/shared/telemetry';
import type { TelemetryEvent } from '@/shared/telemetry';

// Runs in the page's MAIN world. Batches telemetry to the isolated-world
// content bridge via postMessage every 500 ms.

const FLUSH_MS = 500;
const queue: TelemetryEvent[] = [];

const post = (events: TelemetryEvent[]) => {
  const msg: AgentMessage = { source: 'memory-sherlock-agent', events };
  window.postMessage(msg, '*');
};

try {
  const realSetInterval = window.setInterval.bind(window);
  installAgent(window as Window & typeof globalThis, (e) => {
    queue.push(e);
    if (queue.length > 2000) queue.splice(0, queue.length - 2000);
  });
  // announce readiness immediately so the bridge can report capability
  post([]);
  realSetInterval(() => {
    if (queue.length === 0) return;
    post(queue.splice(0, queue.length));
  }, FLUSH_MS);
} catch {
  // instrumentation must never break the page
}
