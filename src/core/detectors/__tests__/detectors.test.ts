import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from '../../heap/__tests__/fixture';
import { createEngineState, handleOp } from '../../heap/protocol';
import { heapApiFromEngine } from '../heapApi';
import { TelemetryStore } from '../telemetryStore';
import { detachedDomDetector } from '../detachedDom';
import { eventListenerDetector } from '../eventListener';
import { collectionGrowthDetector } from '../collectionGrowth';
import { timerDetector } from '../timer';
import { observerDetector } from '../observer';
import { closureDetector } from '../closure';
import { reactFiberDetector } from '../reactFiber';
import type { HeapQueryApi } from '../types';

function loadHeap(build: (b: SnapshotBuilder) => void): HeapQueryApi {
  const b = new SnapshotBuilder();
  build(b);
  const state = createEngineState();
  const { snapshotId } = handleOp(state, { op: 'load', chunks: [JSON.stringify(b.build())] });
  return heapApiFromEngine(state, snapshotId);
}

describe('detachedDomDetector', () => {
  it('emits a high-confidence candidate with retainer path and owner', async () => {
    const heap = loadHeap((b) => {
      const root = b.node('', { type: 'synthetic', selfSize: 0 });
      const closure = b.node('showDialog', { type: 'closure', selfSize: 8 });
      const div = b.node('Detached HTMLDivElement', {
        type: 'native',
        selfSize: 600 * 1024,
        detachedness: 2,
      });
      b.edge(root, closure, { name: 'context' });
      b.edge(closure, div, { name: 'savedNode' });
    });
    const candidates = await detachedDomDetector.analyze({ heap });
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.classification).toBe('detached-dom');
    expect(c.confidence).toBe(95);
    expect(c.severity).toBe(3); // 600KB -> severity 3
    expect(c.evidence.retainerPath!.length).toBeGreaterThan(1);
    expect(c.owner.functionName).toBe('showDialog');
  });
});

describe('eventListenerDetector', () => {
  it('flags listeners whose target left the DOM at confidence 90', async () => {
    const agent = new TelemetryStore();
    agent.ingest([
      { kind: 'listener-added', id: 1, type: 'click', targetDesc: 'div.modal', targetIsNode: true, stack: ['at mount (http://app/Dialog.tsx:12:3)'], t: 1 },
      { kind: 'target-removed', ids: [1], t: 2 },
    ]);
    const candidates = await eventListenerDetector.analyze({ agent });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe(90);
    expect(candidates[0].classification).toBe('event-listener');
    expect(candidates[0].owner.url).toContain('Dialog.tsx');
  });

  it('flags repeated window listeners (same stack >= 3) at confidence 75', async () => {
    const agent = new TelemetryStore();
    for (let i = 0; i < 3; i++) {
      agent.ingest([
        { kind: 'listener-added', id: 10 + i, type: 'resize', targetDesc: 'window', targetIsNode: false, stack: ['at useEffect (http://app/Chart.tsx:40:5)'], t: i },
      ]);
    }
    const candidates = await eventListenerDetector.analyze({ agent });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe(75);
    expect(candidates[0].count).toBe(3);
  });

  it('stays quiet for healthy listeners', async () => {
    const agent = new TelemetryStore();
    agent.ingest([
      { kind: 'listener-added', id: 1, type: 'click', targetDesc: 'button', targetIsNode: true, stack: ['at x'], t: 1 },
    ]);
    expect(await eventListenerDetector.analyze({ agent })).toEqual([]);
  });
});

describe('collectionGrowthDetector', () => {
  it('flags growing collections above the size threshold', async () => {
    const diff = [
      { name: 'Map', addedCount: 200, removedCount: 0, countDelta: 200, sizeDelta: 120 * 1024 },
      { name: 'Array', addedCount: 5, removedCount: 5, countDelta: 0, sizeDelta: 100 },
      { name: 'CacheEntry', addedCount: 500, removedCount: 0, countDelta: 500, sizeDelta: 900 * 1024 },
    ];
    const candidates = await collectionGrowthDetector.analyze({ diff });
    const names = candidates.map((c) => c.title);
    expect(names.some((n) => n.includes('Map'))).toBe(true);
    expect(names.some((n) => n.includes('CacheEntry'))).toBe(true);
    expect(names.some((n) => n.includes('Array'))).toBe(false);
    expect(candidates[0].confidence).toBe(60);
  });
});

describe('timerDetector', () => {
  it('flags repeated same-stack intervals at 80 and lone old intervals at 55', async () => {
    const agent = new TelemetryStore();
    const old = Date.now() - 60_000;
    for (let i = 0; i < 3; i++) {
      agent.ingest([
        { kind: 'timer-set', id: 30 + i, timerKind: 'interval', stack: ['at poll (http://app/usePoll.ts:8:3)'], t: old },
      ]);
    }
    agent.ingest([
      { kind: 'timer-set', id: 40, timerKind: 'interval', stack: ['at once (http://app/App.tsx:5:1)'], t: old },
    ]);
    const candidates = await timerDetector.analyze({ agent });
    const repeated = candidates.find((c) => c.count === 3)!;
    const lone = candidates.find((c) => c.count === 1)!;
    expect(repeated.confidence).toBe(80);
    expect(lone.confidence).toBe(55);
  });

  it('ignores young intervals', async () => {
    const agent = new TelemetryStore();
    agent.ingest([{ kind: 'timer-set', id: 1, timerKind: 'interval', stack: ['at x'], t: Date.now() }]);
    expect(await timerDetector.analyze({ agent })).toEqual([]);
  });
});

describe('observerDetector', () => {
  it('flags long-lived observers, higher confidence for repeated creations', async () => {
    const agent = new TelemetryStore();
    const old = Date.now() - 60_000;
    for (let i = 0; i < 3; i++) {
      agent.ingest([
        { kind: 'observer-created', id: 50 + i, observerType: 'ResizeObserver', stack: ['at watch (http://app/Panel.tsx:9:5)'], t: old },
        { kind: 'observer-observe', id: 50 + i, observerType: 'ResizeObserver', stack: [], t: old },
      ]);
    }
    const candidates = await observerDetector.analyze({ agent });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe(85);
    expect(candidates[0].count).toBe(3);
    expect(candidates[0].classification).toBe('observer');
  });
});

describe('closureDetector', () => {
  it('flags large closures that grew across the diff', async () => {
    const heap = loadHeap((b) => {
      const root = b.node('', { type: 'synthetic', selfSize: 0 });
      const closure = b.node('bigClosure', { type: 'closure', selfSize: 8 });
      const captured = b.node('Array', { type: 'array', selfSize: 400 * 1024 });
      b.edge(root, closure, { name: 'ctx' });
      b.edge(closure, captured, { name: 'capturedList' });
    });
    const diff = [
      { name: 'bigClosure()', addedCount: 2, removedCount: 0, countDelta: 2, sizeDelta: 1024 },
    ];
    const candidates = await closureDetector.analyze({ heap, diff });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe(65);
    expect(candidates[0].classification).toBe('closure');
    expect(candidates[0].retainedBytes).toBeGreaterThan(250 * 1024);
  });

  it('ignores large but stable closures', async () => {
    const heap = loadHeap((b) => {
      const root = b.node('', { type: 'synthetic', selfSize: 0 });
      const closure = b.node('stableClosure', { type: 'closure', selfSize: 8 });
      const captured = b.node('Array', { type: 'array', selfSize: 400 * 1024 });
      b.edge(root, closure);
      b.edge(closure, captured);
    });
    expect(await closureDetector.analyze({ heap, diff: [] })).toEqual([]);
  });
});

describe('reactFiberDetector', () => {
  it('emits a low-confidence stub candidate when fibers grow', async () => {
    const heap = loadHeap((b) => {
      const root = b.node('', { type: 'synthetic', selfSize: 0 });
      for (let i = 0; i < 5; i++) {
        const f = b.node('FiberNode', { selfSize: 200 });
        b.edge(root, f);
      }
    });
    const diff = [{ name: 'FiberNode', addedCount: 3, removedCount: 0, countDelta: 3, sizeDelta: 600 }];
    const candidates = await reactFiberDetector.analyze({ heap, diff });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe(40);
    expect(candidates[0].classification).toBe('react-fiber');
  });

  it('is silent without fiber growth', async () => {
    const heap = loadHeap((b) => {
      b.node('', { type: 'synthetic', selfSize: 0 });
    });
    expect(await reactFiberDetector.analyze({ heap, diff: [] })).toEqual([]);
  });
});
