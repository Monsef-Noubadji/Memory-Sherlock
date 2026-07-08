import { describe, it, expect } from 'vitest';
import { runDetectors } from '../run';
import { TelemetryStore } from '../telemetryStore';
import type { Detector } from '../types';
import type { LeakCandidate } from '@/shared/leak';

const fakeCandidate = (id: string, severity: 1 | 5): LeakCandidate => ({
  id,
  classification: 'timer',
  title: id,
  severity,
  confidence: 50,
  retainedBytes: 0,
  count: 1,
  owner: {},
  evidence: {},
  fixPattern: 'clear the timer',
  detectorId: 'fake',
});

describe('runDetectors', () => {
  it('skips detectors whose requirements are unmet and reports them unavailable', async () => {
    const ran: string[] = [];
    const detectors: Detector[] = [
      {
        id: 'needs-heap',
        title: 'Needs Heap',
        requires: ['heap'],
        analyze: async () => {
          ran.push('needs-heap');
          return [];
        },
      },
      {
        id: 'needs-agent',
        title: 'Needs Agent',
        requires: ['agent'],
        analyze: async () => {
          ran.push('needs-agent');
          return [fakeCandidate('a', 1)];
        },
      },
    ];
    const result = await runDetectors(detectors, { agent: new TelemetryStore() });
    expect(ran).toEqual(['needs-agent']);
    expect(result.unavailable).toEqual([{ id: 'needs-heap', title: 'Needs Heap', missing: ['heap'] }]);
    expect(result.candidates).toHaveLength(1);
  });

  it('sorts candidates by severity then confidence and survives a throwing detector', async () => {
    const detectors: Detector[] = [
      {
        id: 'ok',
        title: 'OK',
        requires: [],
        analyze: async () => [fakeCandidate('low', 1), fakeCandidate('high', 5)],
      },
      {
        id: 'boom',
        title: 'Boom',
        requires: [],
        analyze: async () => {
          throw new Error('detector exploded');
        },
      },
    ];
    const result = await runDetectors(detectors, {});
    expect(result.candidates.map((c) => c.id)).toEqual(['high', 'low']);
    expect(result.unavailable.some((u) => u.id === 'boom')).toBe(true);
  });
});

describe('TelemetryStore', () => {
  it('joins listener lifecycle: added, removed, and target-removed', () => {
    const store = new TelemetryStore();
    store.ingest([
      { kind: 'listener-added', id: 1, type: 'click', targetDesc: 'button#save', targetIsNode: true, stack: ['at A'], t: 1 },
      { kind: 'listener-added', id: 2, type: 'resize', targetDesc: 'window', targetIsNode: false, stack: ['at B'], t: 2 },
      { kind: 'listener-removed', id: 1, type: 'click', targetDesc: 'button#save', targetIsNode: true, stack: [], t: 3 },
      { kind: 'target-removed', ids: [2], t: 4 },
    ]);
    const live = store.liveListeners();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: 2, type: 'resize', targetRemoved: true });
  });

  it('tracks live timers and observers', () => {
    const store = new TelemetryStore();
    store.ingest([
      { kind: 'timer-set', id: 10, timerKind: 'interval', stack: ['at tick'], t: 1 },
      { kind: 'timer-set', id: 11, timerKind: 'interval', stack: ['at tick'], t: 2 },
      { kind: 'timer-cleared', id: 10, timerKind: 'interval', stack: [], t: 3 },
      { kind: 'observer-created', id: 20, observerType: 'ResizeObserver', stack: ['at obs'], t: 4 },
      { kind: 'observer-observe', id: 20, observerType: 'ResizeObserver', stack: [], t: 5 },
      { kind: 'observer-created', id: 21, observerType: 'ResizeObserver', stack: ['at obs2'], t: 6 },
      { kind: 'observer-observe', id: 21, observerType: 'ResizeObserver', stack: [], t: 7 },
      { kind: 'observer-disconnect', id: 21, observerType: 'ResizeObserver', stack: [], t: 8 },
    ]);
    expect(store.liveTimers().map((t) => t.id)).toEqual([11]);
    const observers = store.liveObservers();
    expect(observers).toHaveLength(1);
    expect(observers[0]).toMatchObject({ id: 20, observeCount: 1 });
  });

  it('groups repeat signatures by creation stack', () => {
    const store = new TelemetryStore();
    for (let i = 0; i < 4; i++) {
      store.ingest([
        { kind: 'listener-added', id: 100 + i, type: 'scroll', targetDesc: 'window', targetIsNode: false, stack: ['at mount (Dialog.tsx:12)'], t: i },
      ]);
    }
    const sigs = store.repeatSignatures('listener', 3);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].count).toBe(4);
    expect(sigs[0].ids).toHaveLength(4);
  });

  it('exposes the memory series in order', () => {
    const store = new TelemetryStore();
    store.ingest([
      { kind: 'memory-sample', usedJSHeapSize: 100, totalJSHeapSize: 200, t: 1 },
      { kind: 'memory-sample', usedJSHeapSize: 150, totalJSHeapSize: 200, t: 2 },
    ]);
    expect(store.memorySeries()).toEqual([
      { t: 1, used: 100, total: 200 },
      { t: 2, used: 150, total: 200 },
    ]);
  });
});
