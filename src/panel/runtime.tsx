import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { HeapClient } from '@/core/heap/HeapClient';
import { createSessionStore, initLiveSession, getHeapClient, type SessionSlice, type SessionStore } from './stores/session';
import { createSettingsStore, type SettingsSlice, type SettingsStore } from './stores/settings';
import { createAnalysisStore, type AnalysisSlice, type AnalysisStore } from './stores/analysis';
import { createUiStore, type UiSlice, type UiStore } from './stores/ui';

export interface Runtime {
  session: SessionStore;
  settings: SettingsStore;
  analysis: AnalysisStore;
  ui: UiStore;
  heap: () => HeapClient | null;
}

function isDevtoolsContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.devtools?.inspectedWindow;
}

let devHeapClient: HeapClient | null = null;

export function createRuntime(): Runtime {
  let session: SessionStore;
  let heap: () => HeapClient | null;

  if (isDevtoolsContext()) {
    session = initLiveSession(() => new HeapClient());
    heap = () => getHeapClient();
  } else {
    // standalone dev mode (vite dev server): heap worker works, no chrome APIs
    heap = () => {
      if (!devHeapClient && typeof Worker !== 'undefined') devHeapClient = new HeapClient();
      return devHeapClient;
    };
    session = createSessionStore({
      post: () => undefined,
      loadSnapshot: (chunks) => {
        const client = heap();
        if (!client) return Promise.reject(new Error('no worker in this environment'));
        return client.request({ op: 'load', chunks });
      },
    });
  }

  const settings = createSettingsStore();
  const analysis = createAnalysisStore({ session, settings, heap });
  const ui = createUiStore();
  return { session, settings, analysis, ui, heap };
}

const RuntimeContext = createContext<Runtime | null>(null);

export function RuntimeProvider({ runtime, children }: { runtime: Runtime; children: ReactNode }) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): Runtime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error('RuntimeProvider missing');
  return rt;
}

export function useSessionState<T>(sel: (s: SessionSlice) => T): T {
  return useStore(useRuntime().session, sel);
}
export function useSettingsState<T>(sel: (s: SettingsSlice) => T): T {
  return useStore(useRuntime().settings, sel);
}
export function useAnalysisState<T>(sel: (s: AnalysisSlice) => T): T {
  return useStore(useRuntime().analysis, sel);
}
export function useUiState<T>(sel: (s: UiSlice) => T): T {
  return useStore(useRuntime().ui, sel);
}
