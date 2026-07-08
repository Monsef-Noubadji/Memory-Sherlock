import type { TelemetryEvent } from './telemetry';

export type SessionState = 'idle' | 'attaching' | 'attached' | 'capturing' | 'detached';

export type PanelToBackground =
  | { type: 'hello'; tabId: number }
  | { type: 'attach' }
  | { type: 'detach' }
  | { type: 'take-snapshot' }
  | { type: 'collect-garbage' }
  | { type: 'get-telemetry'; sinceIndex: number };

export type BackgroundToPanel =
  | { type: 'session-state'; state: SessionState; reason?: string }
  | { type: 'capabilities'; agent: boolean; debugger: boolean }
  | { type: 'snapshot-chunk'; chunk: string }
  | { type: 'snapshot-done' }
  | { type: 'telemetry-batch'; events: TelemetryEvent[]; nextIndex: number }
  | { type: 'error'; message: string };

/** Content script -> background messages. */
export type ContentToBackground =
  | { type: 'agent-ready' }
  | { type: 'agent-unavailable'; reason: string }
  | { type: 'telemetry'; events: TelemetryEvent[] };
