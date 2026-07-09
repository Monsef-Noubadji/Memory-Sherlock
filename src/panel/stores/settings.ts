import { createStore } from 'zustand/vanilla';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_NVIDIA_MODEL } from '@/core/ai/provider';
import type { ProviderConfig, ProviderKind } from '@/core/ai/provider';

export interface SettingsSlice {
  provider: ProviderKind;
  claudeKey: string;
  claudeModel: string;
  nvidiaKey: string;
  nvidiaModel: string;
  samplingIntervalMs: number;
  disabledDetectors: string[];
  setProvider: (p: ProviderKind) => void;
  setKey: (p: 'claude' | 'nvidia', key: string) => void;
  setModel: (p: 'claude' | 'nvidia', model: string) => void;
  setSamplingInterval: (ms: number) => void;
  toggleDetector: (id: string) => void;
  /** The full config the AI layer consumes. */
  providerConfig: () => ProviderConfig;
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

const PERSIST_KEYS = [
  'provider',
  'claudeKey',
  'claudeModel',
  'nvidiaKey',
  'nvidiaModel',
  'apiKey', // legacy: pre-multi-provider Claude key
  'samplingIntervalMs',
  'disabledDetectors',
];

export function createSettingsStore(backend?: StorageLike) {
  const storage = backend ?? chromeStorage() ?? localStorageBackend;
  const store = createStore<SettingsSlice>()((set, get) => ({
    provider: 'heuristic',
    claudeKey: '',
    claudeModel: DEFAULT_CLAUDE_MODEL,
    nvidiaKey: '',
    nvidiaModel: DEFAULT_NVIDIA_MODEL,
    samplingIntervalMs: 2000,
    disabledDetectors: [],

    setProvider: (provider) => {
      set({ provider });
      void storage.set({ provider });
    },
    setKey: (p, key) => {
      if (p === 'claude') {
        set({ claudeKey: key });
        void storage.set({ claudeKey: key });
      } else {
        set({ nvidiaKey: key });
        void storage.set({ nvidiaKey: key });
      }
    },
    setModel: (p, model) => {
      if (p === 'claude') {
        set({ claudeModel: model });
        void storage.set({ claudeModel: model });
      } else {
        set({ nvidiaModel: model });
        void storage.set({ nvidiaModel: model });
      }
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

    providerConfig: () => {
      const s = get();
      return {
        active: s.provider,
        claudeKey: s.claudeKey,
        claudeModel: s.claudeModel,
        nvidiaKey: s.nvidiaKey,
        nvidiaModel: s.nvidiaModel,
      };
    },
  }));

  void storage.get(PERSIST_KEYS).then((saved) => {
    const str = (v: unknown): v is string => typeof v === 'string';
    const legacyKey = str(saved.apiKey) ? saved.apiKey : '';
    const claudeKey = str(saved.claudeKey) ? saved.claudeKey : legacyKey;
    // If a legacy Claude key existed and no explicit provider was chosen, activate Claude.
    const provider =
      saved.provider === 'claude' || saved.provider === 'nvidia' || saved.provider === 'heuristic'
        ? saved.provider
        : claudeKey
          ? 'claude'
          : 'heuristic';
    store.setState({
      provider,
      claudeKey,
      ...(str(saved.claudeModel) ? { claudeModel: saved.claudeModel } : {}),
      ...(str(saved.nvidiaKey) ? { nvidiaKey: saved.nvidiaKey } : {}),
      ...(str(saved.nvidiaModel) ? { nvidiaModel: saved.nvidiaModel } : {}),
      ...(typeof saved.samplingIntervalMs === 'number' ? { samplingIntervalMs: saved.samplingIntervalMs } : {}),
      ...(Array.isArray(saved.disabledDetectors) ? { disabledDetectors: saved.disabledDetectors as string[] } : {}),
    });
  });

  return store;
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
