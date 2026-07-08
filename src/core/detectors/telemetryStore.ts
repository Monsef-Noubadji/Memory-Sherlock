import type { TelemetryEvent } from '@/shared/telemetry';

export interface LiveListener {
  id: number;
  type: string;
  targetDesc: string;
  targetIsNode: boolean;
  stack: string[];
  addedAt: number;
  targetRemoved: boolean;
}

export interface LiveTimer {
  id: number;
  timerKind: 'interval' | 'timeout';
  stack: string[];
  setAt: number;
}

export interface LiveObserver {
  id: number;
  observerType: string;
  stack: string[];
  createdAt: number;
  observeCount: number;
}

export interface RepeatSignature {
  signature: string[];
  count: number;
  ids: number[];
}

/** Indexed agent telemetry with lifecycle joins. */
export class TelemetryStore {
  private listeners = new Map<number, LiveListener>();
  private timers = new Map<number, LiveTimer>();
  private observers = new Map<number, LiveObserver & { disconnected: boolean }>();
  private samples: Array<{ t: number; used: number; total: number }> = [];
  /** All listener additions ever seen (for repeat-signature detection). */
  private listenerHistory: Array<{ id: number; stack: string[] }> = [];
  private timerHistory: Array<{ id: number; stack: string[] }> = [];

  ingest(events: TelemetryEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'listener-added':
          this.listeners.set(e.id, {
            id: e.id,
            type: e.type,
            targetDesc: e.targetDesc,
            targetIsNode: e.targetIsNode,
            stack: e.stack,
            addedAt: e.t,
            targetRemoved: false,
          });
          this.listenerHistory.push({ id: e.id, stack: e.stack });
          break;
        case 'listener-removed':
          this.listeners.delete(e.id);
          break;
        case 'target-removed':
          for (const id of e.ids) {
            const l = this.listeners.get(id);
            if (l) l.targetRemoved = true;
          }
          break;
        case 'timer-set':
          this.timers.set(e.id, { id: e.id, timerKind: e.timerKind, stack: e.stack, setAt: e.t });
          this.timerHistory.push({ id: e.id, stack: e.stack });
          break;
        case 'timer-cleared':
          this.timers.delete(e.id);
          break;
        case 'observer-created':
          this.observers.set(e.id, {
            id: e.id,
            observerType: e.observerType,
            stack: e.stack,
            createdAt: e.t,
            observeCount: 0,
            disconnected: false,
          });
          break;
        case 'observer-observe': {
          const o = this.observers.get(e.id);
          if (o) o.observeCount++;
          break;
        }
        case 'observer-disconnect': {
          const o = this.observers.get(e.id);
          if (o) o.disconnected = true;
          break;
        }
        case 'memory-sample':
          this.samples.push({ t: e.t, used: e.usedJSHeapSize, total: e.totalJSHeapSize });
          break;
      }
    }
  }

  liveListeners(): LiveListener[] {
    return [...this.listeners.values()];
  }

  liveTimers(): LiveTimer[] {
    return [...this.timers.values()];
  }

  /** Observers that are observing and have not disconnected. */
  liveObservers(): LiveObserver[] {
    return [...this.observers.values()].filter((o) => !o.disconnected && o.observeCount > 0);
  }

  memorySeries(): Array<{ t: number; used: number; total: number }> {
    return this.samples;
  }

  repeatSignatures(kind: 'listener' | 'timer', minCount: number): RepeatSignature[] {
    const history = kind === 'listener' ? this.listenerHistory : this.timerHistory;
    const groups = new Map<string, RepeatSignature>();
    for (const h of history) {
      if (h.stack.length === 0) continue;
      const key = h.stack.join('\n');
      let g = groups.get(key);
      if (!g) {
        g = { signature: h.stack, count: 0, ids: [] };
        groups.set(key, g);
      }
      g.count++;
      g.ids.push(h.id);
    }
    return [...groups.values()].filter((g) => g.count >= minCount).sort((a, b) => b.count - a.count);
  }
}
