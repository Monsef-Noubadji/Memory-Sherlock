import { createStore } from 'zustand/vanilla';

export interface SettingsSlice {
  apiKey: string;
  samplingIntervalMs: number;
  disabledDetectors: string[];
  setApiKey: (key: string) => void;
  setSamplingInterval: (ms: number) => void;
  toggleDetector: (id: string) => void;
}

interface StorageLike {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

function chromeStorage(): StorageLike | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return {
      get: (keys) => chrome.storage.local.get(keys),
      set: (items) => chrome.storage.local.set(items),
    };
  }
  return null;
}

const localStorageBackend: StorageLike = {
  get: async (keys) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = globalThis.localStorage?.getItem(`ms-${k}`);
      if (v !== null && v !== undefined) out[k] = JSON.parse(v);
    }
    return out;
  },
  set: async (items) => {
    for (const [k, v] of Object.entries(items)) {
      globalThis.localStorage?.setItem(`ms-${k}`, JSON.stringify(v));
    }
  },
};

export function createSettingsStore(backend?: StorageLike) {
  const storage = backend ?? chromeStorage() ?? localStorageBackend;
  const store = createStore<SettingsSlice>()((set, get) => ({
    apiKey: '',
    samplingIntervalMs: 2000,
    disabledDetectors: [],
    setApiKey: (apiKey) => {
      set({ apiKey });
      void storage.set({ apiKey });
    },
    setSamplingInterval: (samplingIntervalMs) => {
      set({ samplingIntervalMs });
      void storage.set({ samplingIntervalMs });
    },
    toggleDetector: (id) => {
      const cur = get().disabledDetectors;
      const disabledDetectors = cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id];
      set({ disabledDetectors });
      void storage.set({ disabledDetectors });
    },
  }));
  void storage.get(['apiKey', 'samplingIntervalMs', 'disabledDetectors']).then((saved) => {
    store.setState({
      ...(typeof saved.apiKey === 'string' ? { apiKey: saved.apiKey } : {}),
      ...(typeof saved.samplingIntervalMs === 'number' ? { samplingIntervalMs: saved.samplingIntervalMs } : {}),
      ...(Array.isArray(saved.disabledDetectors) ? { disabledDetectors: saved.disabledDetectors as string[] } : {}),
    });
  });
  return store;
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
