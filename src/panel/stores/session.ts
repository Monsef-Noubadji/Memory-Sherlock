import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BackgroundToPanel, PanelToBackground, SessionState } from '@/shared/messages';
import type { TelemetryEvent } from '@/shared/telemetry';
import type { LoadResult } from '@/core/heap/protocol';

export interface SnapshotMeta {
  id: number;
  label: string;
  time: number;
  nodeCount: number;
  totalSize: number;
}

export interface SessionDeps {
  post: (msg: PanelToBackground) => void;
  loadSnapshot: (chunks: string[]) => Promise<LoadResult>;
  now?: () => number;
}

export interface SessionSlice {
  sessionState: SessionState;
  capabilities: { agent: boolean; debugger: boolean };
  errors: string[];
  events: TelemetryEvent[];
  telemetryNextIndex: number;
  snapshots: SnapshotMeta[];
  pendingChunks: string[];
  loadingSnapshot: boolean;
  onMessage: (msg: BackgroundToPanel) => void | Promise<void>;
  attach: () => void;
  detach: () => void;
  takeSnapshot: () => void;
  collectGarbage: () => void;
  dismissError: (index: number) => void;
}

export type SessionStore = ReturnType<typeof createSessionStore>;

const MAX_EVENTS = 50_000;

export function createSessionStore(deps: SessionDeps) {
  const now = deps.now ?? Date.now;
  return createStore<SessionSlice>()((set, get) => ({
    sessionState: 'idle',
    capabilities: { agent: false, debugger: false },
    errors: [],
    events: [],
    telemetryNextIndex: 0,
    snapshots: [],
    pendingChunks: [],
    loadingSnapshot: false,

    onMessage(msg: BackgroundToPanel) {
      switch (msg.type) {
        case 'session-state':
          set({ sessionState: msg.state });
          return;
        case 'capabilities':
          set({ capabilities: { agent: msg.agent, debugger: msg.debugger } });
          return;
        case 'telemetry-batch': {
          const events = [...get().events, ...msg.events];
          if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
          set({ events, telemetryNextIndex: msg.nextIndex });
          return;
        }
        case 'snapshot-chunk':
          set({ pendingChunks: [...get().pendingChunks, msg.chunk] });
          return;
        case 'snapshot-done': {
          const chunks = get().pendingChunks;
          set({ pendingChunks: [], loadingSnapshot: true });
          return deps
            .loadSnapshot(chunks)
            .then((res) => {
              const meta: SnapshotMeta = {
                id: res.snapshotId,
                label: `Snapshot ${res.snapshotId}`,
                time: now(),
                nodeCount: res.nodeCount,
                totalSize: res.totalSize,
              };
              set({ snapshots: [...get().snapshots, meta], loadingSnapshot: false });
            })
            .catch((err: unknown) => {
              set({
                loadingSnapshot: false,
                errors: [...get().errors, `snapshot parse failed: ${err instanceof Error ? err.message : String(err)}`],
              });
            });
        }
        case 'error':
          set({ errors: [...get().errors, msg.message] });
          return;
      }
    },

    attach: () => deps.post({ type: 'attach' }),
    detach: () => deps.post({ type: 'detach' }),
    takeSnapshot: () => deps.post({ type: 'take-snapshot' }),
    collectGarbage: () => deps.post({ type: 'collect-garbage' }),
    dismissError: (index) => set({ errors: get().errors.filter((_, i) => i !== index) }),
  }));
}

// ---- singleton wiring for the real panel (created lazily so tests never touch chrome.*) ----

let liveStore: SessionStore | null = null;
let liveHeapClient: import('@/core/heap/HeapClient').HeapClient | null = null;

export function initLiveSession(
  heapClientFactory: () => import('@/core/heap/HeapClient').HeapClient,
): SessionStore {
  if (liveStore) return liveStore;
  const tabId = chrome.devtools.inspectedWindow.tabId;
  const port = chrome.runtime.connect({ name: 'panel' });
  const heap = heapClientFactory();
  liveHeapClient = heap;
  const store = createSessionStore({
    post: (msg) => port.postMessage(msg),
    loadSnapshot: (chunks) => heap.request({ op: 'load', chunks }),
  });
  port.onMessage.addListener((msg: BackgroundToPanel) => void store.getState().onMessage(msg));
  port.onDisconnect.addListener(() => {
    store.setState({ sessionState: 'detached' });
  });
  port.postMessage({ type: 'hello', tabId } satisfies PanelToBackground);
  // poll telemetry as a fallback in case pushes were missed while the panel was closed
  setInterval(() => {
    port.postMessage({ type: 'get-telemetry', sinceIndex: store.getState().telemetryNextIndex });
  }, 2000);
  liveStore = store;
  return store;
}

export function getHeapClient(): import('@/core/heap/HeapClient').HeapClient {
  if (!liveHeapClient) throw new Error('session not initialized');
  return liveHeapClient;
}

export function useSession<T>(store: SessionStore, selector: (s: SessionSlice) => T): T {
  return useStore(store, selector);
}
