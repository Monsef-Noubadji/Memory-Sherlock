import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebuggerSession } from '../DebuggerSession';
import { TelemetryBuffer } from '../TelemetryBuffer';
import type { SessionState } from '@/shared/messages';

type DetachListener = (source: { tabId?: number }, reason: string) => void;
type EventListenerFn = (source: { tabId?: number }, method: string, params?: object) => void;

function makeChromeMock() {
  const detachListeners: DetachListener[] = [];
  const eventListeners: EventListenerFn[] = [];
  const mock = {
    debugger: {
      attach: vi.fn((_t: object, _v: string, cb: () => void) => cb()),
      detach: vi.fn((_t: object, cb: () => void) => cb()),
      sendCommand: vi.fn((_t: object, _m: string, _p: object | undefined, cb?: (r?: object) => void) => cb?.({})),
      onDetach: { addListener: (l: DetachListener) => detachListeners.push(l) },
      onEvent: { addListener: (l: EventListenerFn) => eventListeners.push(l) },
    },
    runtime: { lastError: undefined as { message: string } | undefined },
  };
  vi.stubGlobal('chrome', mock);
  return { mock, detachListeners, eventListeners };
}

describe('DebuggerSession', () => {
  let states: SessionState[];
  beforeEach(() => {
    states = [];
  });

  it('walks idle -> attaching -> attached on attach()', async () => {
    makeChromeMock();
    const s = new DebuggerSession(42, (st) => states.push(st));
    expect(s.state).toBe('idle');
    await s.attach();
    expect(states).toEqual(['attaching', 'attached']);
    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 42 }, '1.3', expect.any(Function));
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'HeapProfiler.enable',
      undefined,
      expect.any(Function),
    );
  });

  it('reports attach failure and returns to idle', async () => {
    const { mock } = makeChromeMock();
    mock.debugger.attach.mockImplementation((_t: object, _v: string, cb: () => void) => {
      mock.runtime.lastError = { message: 'Another debugger is already attached' };
      cb();
      mock.runtime.lastError = undefined;
    });
    const s = new DebuggerSession(42, (st) => states.push(st));
    await expect(s.attach()).rejects.toThrow(/already attached/i);
    expect(s.state).toBe('idle');
  });

  it('streams snapshot chunks and finishes', async () => {
    const { mock, eventListeners } = makeChromeMock();
    mock.debugger.sendCommand.mockImplementation(
      (_t: object, method: string, _p: object | undefined, cb?: (r?: object) => void) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          for (const l of eventListeners) {
            l({ tabId: 42 }, 'HeapProfiler.addHeapSnapshotChunk', { chunk: '{"part":1' });
            l({ tabId: 42 }, 'HeapProfiler.addHeapSnapshotChunk', { chunk: '}' });
          }
        }
        cb?.({});
      },
    );
    const s = new DebuggerSession(42, (st) => states.push(st));
    await s.attach();
    const chunks: string[] = [];
    await s.takeSnapshot((c) => chunks.push(c));
    expect(chunks).toEqual(['{"part":1', '}']);
    expect(s.state).toBe('attached'); // capturing -> back to attached
    expect(states).toContain('capturing');
  });

  it('ignores chunk events from other tabs', async () => {
    const { mock, eventListeners } = makeChromeMock();
    mock.debugger.sendCommand.mockImplementation(
      (_t: object, method: string, _p: object | undefined, cb?: (r?: object) => void) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          for (const l of eventListeners) {
            l({ tabId: 7 }, 'HeapProfiler.addHeapSnapshotChunk', { chunk: 'WRONG' });
            l({ tabId: 42 }, 'HeapProfiler.addHeapSnapshotChunk', { chunk: 'RIGHT' });
          }
        }
        cb?.({});
      },
    );
    const s = new DebuggerSession(42, () => undefined);
    await s.attach();
    const chunks: string[] = [];
    await s.takeSnapshot((c) => chunks.push(c));
    expect(chunks).toEqual(['RIGHT']);
  });

  it('transitions to detached when chrome fires onDetach', async () => {
    const { detachListeners } = makeChromeMock();
    const s = new DebuggerSession(42, (st) => states.push(st));
    await s.attach();
    for (const l of detachListeners) l({ tabId: 42 }, 'target_closed');
    expect(s.state).toBe('detached');
    expect(states).toEqual(['attaching', 'attached', 'detached']);
  });
});

describe('TelemetryBuffer', () => {
  it('appends events and serves batches from an index', () => {
    const buf = new TelemetryBuffer(5);
    for (let i = 0; i < 3; i++) {
      buf.push([{ kind: 'memory-sample', usedJSHeapSize: i, totalJSHeapSize: 100, t: i }]);
    }
    const batch = buf.since(1);
    expect(batch.events).toHaveLength(2);
    expect(batch.nextIndex).toBe(3);
  });

  it('drops oldest events past capacity but keeps indices monotonic', () => {
    const buf = new TelemetryBuffer(3);
    for (let i = 0; i < 6; i++) {
      buf.push([{ kind: 'memory-sample', usedJSHeapSize: i, totalJSHeapSize: 100, t: i }]);
    }
    const batch = buf.since(0);
    expect(batch.events).toHaveLength(3);
    expect(batch.events[0]).toMatchObject({ usedJSHeapSize: 3 });
    expect(batch.nextIndex).toBe(6);
  });
});
