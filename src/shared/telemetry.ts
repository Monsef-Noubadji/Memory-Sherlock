export type TelemetryEvent =
  | {
      kind: 'listener-added' | 'listener-removed';
      id: number;
      type: string;
      targetDesc: string;
      targetIsNode: boolean;
      stack: string[];
      t: number;
    }
  | {
      kind: 'timer-set' | 'timer-cleared';
      id: number;
      timerKind: 'interval' | 'timeout';
      stack: string[];
      t: number;
    }
  | {
      kind: 'observer-created' | 'observer-observe' | 'observer-disconnect';
      id: number;
      observerType: string;
      stack: string[];
      t: number;
    }
  | { kind: 'target-removed'; ids: number[]; t: number }
  | { kind: 'memory-sample'; usedJSHeapSize: number; totalJSHeapSize: number; t: number };

export type TelemetryKind = TelemetryEvent['kind'];

/** Message posted by the page agent through window.postMessage. */
export interface AgentMessage {
  source: 'memory-sherlock-agent';
  events: TelemetryEvent[];
}

export function isAgentMessage(data: unknown): data is AgentMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'memory-sherlock-agent' &&
    Array.isArray((data as { events?: unknown }).events)
  );
}
