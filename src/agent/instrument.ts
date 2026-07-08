import type { TelemetryEvent } from '@/shared/telemetry';

type Win = Window & typeof globalThis;
type Emit = (e: TelemetryEvent) => void;

const GUARD = '__memorySherlockAgent';

function captureStack(): string[] {
  const raw = new Error().stack ?? '';
  return raw
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => !l.includes('instrument') && !l.includes('memory-sherlock'))
    .slice(1, 9); // drop the wrapper frame itself
}

function describeTarget(win: Win, target: EventTarget): { desc: string; isNode: boolean } {
  if (target === win) return { desc: 'window', isNode: false };
  if (target === win.document) return { desc: 'document', isNode: false };
  if (target instanceof win.Node && target.nodeType === 1) {
    const el = target as Element;
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return { desc: `${el.tagName.toLowerCase()}${id}${cls}`, isNode: true };
  }
  if (target instanceof win.Node) return { desc: target.nodeName.toLowerCase(), isNode: true };
  const ctor = (target as { constructor?: { name?: string } }).constructor?.name ?? 'EventTarget';
  return { desc: ctor, isNode: false };
}

/**
 * Instruments the page: addEventListener/removeEventListener, timers,
 * observers, and DOM-removal tracking for listener targets. Idempotent per
 * window. Returns an uninstall function (restores originals; used in tests).
 */
export function installAgent(win: Win, emit: Emit): () => void {
  const w = win as Win & Record<string, unknown>;
  if (w[GUARD]) return () => undefined;
  w[GUARD] = true;

  const now = () => Date.now();
  let nextId = 1;

  // ---------- listeners ----------
  const fnIds = new WeakMap<object, number>();
  let nextFnId = 1;
  const fnId = (fn: object): number => {
    let id = fnIds.get(fn);
    if (!id) {
      id = nextFnId++;
      fnIds.set(fn, id);
    }
    return id;
  };
  const listenerIds = new WeakMap<EventTarget, Map<string, number>>();
  const nodeTargets = new Map<number, WeakRef<Node>>(); // listener id -> its DOM target

  const recordAdd = (
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    if (!listener) return;
    try {
      const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
      const key = `${type}|${capture}|${fnId(listener)}`;
      let map = listenerIds.get(target);
      if (!map) {
        map = new Map();
        listenerIds.set(target, map);
      }
      if (!map.has(key)) {
        const id = nextId++;
        map.set(key, id);
        const { desc, isNode } = describeTarget(win, target);
        if (isNode) nodeTargets.set(id, new WeakRef(target as Node));
        emit({
          kind: 'listener-added',
          id,
          type,
          targetDesc: desc,
          targetIsNode: isNode,
          stack: captureStack(),
          t: now(),
        });
      }
    } catch {
      // never break the page
    }
  };

  const recordRemove = (
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void => {
    if (!listener) return;
    try {
      const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
      const key = `${type}|${capture}|${fnId(listener)}`;
      const map = listenerIds.get(target);
      const id = map?.get(key);
      if (id !== undefined) {
        map!.delete(key);
        nodeTargets.delete(id);
        const { desc, isNode } = describeTarget(win, target);
        emit({
          kind: 'listener-removed',
          id,
          type,
          targetDesc: desc,
          targetIsNode: isNode,
          stack: [],
          t: now(),
        });
      }
    } catch {
      // never break the page
    }
  };

  const origAdd = win.EventTarget.prototype.addEventListener;
  const origRemove = win.EventTarget.prototype.removeEventListener;

  win.EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    recordAdd(this, type, listener, options);
    return origAdd.call(this, type, listener, options);
  };

  win.EventTarget.prototype.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    recordRemove(this, type, listener, options);
    return origRemove.call(this, type, listener, options);
  };

  // Some environments (jsdom; some browsers for window) expose add/remove
  // as own properties that shadow EventTarget.prototype — wrap those too.
  const ownWraps: Array<{ obj: EventTarget; add: unknown; remove: unknown }> = [];
  for (const obj of [win as EventTarget, win.document as EventTarget]) {
    const rec = obj as EventTarget & {
      addEventListener: typeof EventTarget.prototype.addEventListener;
      removeEventListener: typeof EventTarget.prototype.removeEventListener;
    };
    if (
      Object.prototype.hasOwnProperty.call(obj, 'addEventListener') &&
      rec.addEventListener !== win.EventTarget.prototype.addEventListener
    ) {
      const ownAdd = rec.addEventListener.bind(obj);
      const ownRemove = rec.removeEventListener.bind(obj);
      ownWraps.push({ obj, add: rec.addEventListener, remove: rec.removeEventListener });
      rec.addEventListener = ((type, listener, options) => {
        recordAdd(obj, type, listener ?? null, options);
        return ownAdd(type, listener, options);
      }) as typeof rec.addEventListener;
      rec.removeEventListener = ((type, listener, options) => {
        recordRemove(obj, type, listener ?? null, options);
        return ownRemove(type, listener, options);
      }) as typeof rec.removeEventListener;
    }
  }

  // ---------- DOM removal of listener targets ----------
  let removalObserver: MutationObserver | null = null;
  const OrigMutationObserver = win.MutationObserver;
  const startRemovalObserver = () => {
    removalObserver = new OrigMutationObserver(() => {
      const gone: number[] = [];
      for (const [id, ref] of nodeTargets) {
        const node = ref.deref();
        if (!node || !node.isConnected) {
          gone.push(id);
          nodeTargets.delete(id);
        }
      }
      if (gone.length) emit({ kind: 'target-removed', ids: gone, t: now() });
    });
    removalObserver.observe(win.document, { childList: true, subtree: true });
  };
  if (win.document.readyState === 'loading') {
    origAdd.call(win.document, 'DOMContentLoaded', () => startRemovalObserver(), { once: true });
  } else {
    startRemovalObserver();
  }

  // ---------- timers ----------
  const origSetInterval = win.setInterval.bind(win);
  const origSetTimeout = win.setTimeout.bind(win);
  const origClearInterval = win.clearInterval.bind(win);
  const origClearTimeout = win.clearTimeout.bind(win);

  const liveTimers = new Set<number>();

  win.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = origSetInterval(handler as () => void, timeout, ...args);
    liveTimers.add(id);
    emit({ kind: 'timer-set', id, timerKind: 'interval', stack: captureStack(), t: now() });
    return id;
  }) as typeof win.setInterval;

  win.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    let id: number;
    const wrapped =
      typeof handler === 'function'
        ? (...cbArgs: unknown[]) => {
            if (liveTimers.delete(id)) {
              emit({ kind: 'timer-cleared', id, timerKind: 'timeout', stack: [], t: now() });
            }
            return (handler as (...a: unknown[]) => unknown)(...cbArgs);
          }
        : handler;
    id = origSetTimeout(wrapped as () => void, timeout, ...args);
    liveTimers.add(id);
    emit({ kind: 'timer-set', id, timerKind: 'timeout', stack: captureStack(), t: now() });
    return id;
  }) as typeof win.setTimeout;

  win.clearInterval = ((id?: number) => {
    if (id !== undefined && liveTimers.delete(id)) {
      emit({ kind: 'timer-cleared', id, timerKind: 'interval', stack: [], t: now() });
    }
    return origClearInterval(id);
  }) as typeof win.clearInterval;

  win.clearTimeout = ((id?: number) => {
    if (id !== undefined && liveTimers.delete(id)) {
      emit({ kind: 'timer-cleared', id, timerKind: 'timeout', stack: [], t: now() });
    }
    return origClearTimeout(id);
  }) as typeof win.clearTimeout;

  // ---------- observers ----------
  const observerNames = [
    'MutationObserver',
    'ResizeObserver',
    'IntersectionObserver',
    'PerformanceObserver',
  ] as const;
  const observerOriginals = new Map<string, unknown>();

  for (const name of observerNames) {
    const Orig = w[name] as (new (...args: unknown[]) => { disconnect(): void }) | undefined;
    if (typeof Orig !== 'function') continue;
    observerOriginals.set(name, Orig);
    const Wrapped = function (this: object, ...args: unknown[]) {
      const inst = new Orig(...args);
      const id = nextId++;
      emit({ kind: 'observer-created', id, observerType: name, stack: captureStack(), t: now() });
      const withMethods = inst as {
        observe?: (...a: unknown[]) => unknown;
        disconnect: () => void;
      };
      if (typeof withMethods.observe === 'function') {
        const origObserve = withMethods.observe.bind(inst);
        withMethods.observe = (...oArgs: unknown[]) => {
          emit({ kind: 'observer-observe', id, observerType: name, stack: [], t: now() });
          return origObserve(...oArgs);
        };
      }
      const origDisconnect = withMethods.disconnect.bind(inst);
      withMethods.disconnect = () => {
        emit({ kind: 'observer-disconnect', id, observerType: name, stack: [], t: now() });
        return origDisconnect();
      };
      return inst;
    };
    Wrapped.prototype = Orig.prototype;
    (w as Record<string, unknown>)[name] = Wrapped;
  }

  // ---------- memory sampling ----------
  const perf = win.performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  };
  let samplerId: number | null = null;
  if (perf?.memory) {
    samplerId = origSetInterval(() => {
      const m = perf.memory!;
      emit({
        kind: 'memory-sample',
        usedJSHeapSize: m.usedJSHeapSize,
        totalJSHeapSize: m.totalJSHeapSize,
        t: now(),
      });
    }, 2000);
  }

  return function uninstall() {
    win.EventTarget.prototype.addEventListener = origAdd;
    win.EventTarget.prototype.removeEventListener = origRemove;
    for (const { obj, add, remove } of ownWraps) {
      const rec = obj as unknown as Record<string, unknown>;
      rec.addEventListener = add;
      rec.removeEventListener = remove;
    }
    win.setInterval = origSetInterval as typeof win.setInterval;
    win.setTimeout = origSetTimeout as typeof win.setTimeout;
    win.clearInterval = origClearInterval as typeof win.clearInterval;
    win.clearTimeout = origClearTimeout as typeof win.clearTimeout;
    for (const [name, Orig] of observerOriginals) w[name] = Orig;
    removalObserver?.disconnect();
    if (samplerId !== null) origClearInterval(samplerId);
    delete w[GUARD];
  };
}
