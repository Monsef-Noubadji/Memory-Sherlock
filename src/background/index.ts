import { DebuggerSession } from './DebuggerSession';
import { TelemetryBuffer } from './TelemetryBuffer';
import type { BackgroundToPanel, ContentToBackground, PanelToBackground } from '@/shared/messages';

interface TabState {
  session: DebuggerSession | null;
  buffer: TelemetryBuffer;
  agentReady: boolean;
  agentUnavailableReason?: string;
  panelPorts: Set<chrome.runtime.Port>;
}

const tabs = new Map<number, TabState>();

function tabState(tabId: number): TabState {
  let s = tabs.get(tabId);
  if (!s) {
    s = { session: null, buffer: new TelemetryBuffer(), agentReady: false, panelPorts: new Set() };
    tabs.set(tabId, s);
  }
  return s;
}

function broadcast(state: TabState, msg: BackgroundToPanel): void {
  for (const port of state.panelPorts) {
    try {
      port.postMessage(msg);
    } catch {
      state.panelPorts.delete(port);
    }
  }
}

function sendCapabilities(state: TabState): void {
  broadcast(state, {
    type: 'capabilities',
    agent: state.agentReady,
    debugger: state.session?.state === 'attached' || state.session?.state === 'capturing',
  });
}

function handlePanelMessage(state: TabState, tabId: number, msg: PanelToBackground): void {
  switch (msg.type) {
    case 'hello':
      break; // handled at connect
    case 'attach': {
      if (!state.session || state.session.state === 'detached') {
        state.session = new DebuggerSession(tabId, (st, reason) => {
          broadcast(state, { type: 'session-state', state: st, reason });
          sendCapabilities(state);
        });
      }
      state.session.attach().catch((err: unknown) => {
        broadcast(state, { type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
      break;
    }
    case 'detach':
      state.session?.detach().catch(() => undefined);
      break;
    case 'take-snapshot': {
      const session = state.session;
      if (!session) {
        broadcast(state, { type: 'error', message: 'not attached' });
        return;
      }
      session
        .takeSnapshot((chunk) => broadcast(state, { type: 'snapshot-chunk', chunk }))
        .then(() => broadcast(state, { type: 'snapshot-done' }))
        .catch((err: unknown) => {
          broadcast(state, { type: 'error', message: err instanceof Error ? err.message : String(err) });
        });
      break;
    }
    case 'collect-garbage':
      state.session?.collectGarbage().catch((err: unknown) => {
        broadcast(state, { type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
      break;
    case 'get-telemetry': {
      const batch = state.buffer.since(msg.sinceIndex);
      broadcast(state, { type: 'telemetry-batch', events: batch.events, nextIndex: batch.nextIndex });
      break;
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'panel') {
    let boundTab: number | null = null;
    port.onMessage.addListener((raw: PanelToBackground) => {
      if (raw.type === 'hello') {
        boundTab = raw.tabId;
        const state = tabState(raw.tabId);
        state.panelPorts.add(port);
        port.postMessage({
          type: 'session-state',
          state: state.session?.state ?? 'idle',
        } satisfies BackgroundToPanel);
        sendCapabilities(state);
        if (state.agentUnavailableReason) {
          broadcast(state, { type: 'error', message: `agent unavailable: ${state.agentUnavailableReason}` });
        }
        return;
      }
      if (boundTab !== null) handlePanelMessage(tabState(boundTab), boundTab, raw);
    });
    port.onDisconnect.addListener(() => {
      if (boundTab !== null) tabState(boundTab).panelPorts.delete(port);
    });
    return;
  }

  if (port.name === 'telemetry') {
    const tabId = port.sender?.tab?.id;
    if (tabId === undefined) return;
    const state = tabState(tabId);
    port.onMessage.addListener((raw: ContentToBackground) => {
      switch (raw.type) {
        case 'agent-ready':
          state.agentReady = true;
          sendCapabilities(state);
          break;
        case 'agent-unavailable':
          state.agentReady = false;
          state.agentUnavailableReason = raw.reason;
          sendCapabilities(state);
          break;
        case 'telemetry': {
          state.buffer.push(raw.events);
          const batch = state.buffer.since(state.buffer.since(0).nextIndex - raw.events.length);
          broadcast(state, { type: 'telemetry-batch', events: batch.events, nextIndex: batch.nextIndex });
          break;
        }
      }
    });
    port.onDisconnect.addListener(() => {
      state.agentReady = false;
    });
  }
});
