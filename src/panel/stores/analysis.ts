import { createStore } from 'zustand/vanilla';
import { allDetectors, heapApiFromClient, runDetectors, TelemetryStore } from '@/core/detectors';
import { createProvider } from '@/core/ai/provider';
import type { DetectorContext, DetectorRunResult } from '@/core/detectors';
import type { Explanation, FixSuggestion } from '@/core/ai/types';
import type { LeakCandidate } from '@/shared/leak';
import type { HeapClient } from '@/core/heap/HeapClient';
import type { SessionStore } from './session';
import type { SettingsStore } from './settings';

export interface AnalysisSlice {
  running: boolean;
  result: DetectorRunResult | null;
  lastRunAt: number | null;
  explanations: Record<string, Explanation>;
  fixes: Record<string, FixSuggestion>;
  explaining: Record<string, boolean>;
  runAnalysis: () => Promise<void>;
  explain: (candidate: LeakCandidate) => Promise<void>;
  generateFix: (candidate: LeakCandidate) => Promise<void>;
}

export interface AnalysisDeps {
  session: SessionStore;
  settings: SettingsStore;
  heap: () => HeapClient | null;
}

export function createAnalysisStore(deps: AnalysisDeps) {
  return createStore<AnalysisSlice>()((set, get) => ({
    running: false,
    result: null,
    lastRunAt: null,
    explanations: {},
    fixes: {},
    explaining: {},

    async runAnalysis() {
      if (get().running) return;
      set({ running: true });
      try {
        const s = deps.session.getState();
        const client = deps.heap();
        const ctx: DetectorContext = {};

        const snaps = s.snapshots;
        if (client && snaps.length >= 1) {
          ctx.heap = heapApiFromClient(client, snaps[snaps.length - 1].id);
        }
        if (client && snaps.length >= 2) {
          const diff = await client.request({
            op: 'diff',
            beforeId: snaps[snaps.length - 2].id,
            afterId: snaps[snaps.length - 1].id,
            page: 0,
            pageSize: 10_000,
          });
          ctx.diff = diff.rows;
        }
        if (s.capabilities.agent || s.events.length > 0) {
          const store = new TelemetryStore();
          store.ingest(s.events);
          ctx.agent = store;
        }

        const disabled = new Set(deps.settings.getState().disabledDetectors);
        const detectors = allDetectors.filter((d) => !disabled.has(d.id));
        const result = await runDetectors(detectors, ctx);
        set({ result, lastRunAt: Date.now() });
      } finally {
        set({ running: false });
      }
    },

    async explain(candidate) {
      if (get().explanations[candidate.id] || get().explaining[candidate.id]) return;
      set({ explaining: { ...get().explaining, [candidate.id]: true } });
      try {
        const provider = createProvider(deps.settings.getState().providerConfig());
        const explanation = await provider.explain(candidate);
        set({ explanations: { ...get().explanations, [candidate.id]: explanation } });
      } finally {
        set({ explaining: { ...get().explaining, [candidate.id]: false } });
      }
    },

    async generateFix(candidate) {
      if (get().fixes[candidate.id]) return;
      const provider = createProvider(deps.settings.getState().providerConfig());
      const fix = await provider.suggestFix(candidate);
      set({ fixes: { ...get().fixes, [candidate.id]: fix } });
    },
  }));
}

export type AnalysisStore = ReturnType<typeof createAnalysisStore>;
