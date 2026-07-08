import { formatBytes, type LeakCandidate, type LeakClassification } from '@/shared/leak';
import type { Explanation, ExplanationProvider, FixSuggestion } from './types';

interface Template {
  why: (c: LeakCandidate) => string;
  patch: (c: LeakCandidate) => { language: string; patch: string; rationale: string };
}

function ownerPhrase(c: LeakCandidate): string {
  const fn = c.owner.functionName ? `'${c.owner.functionName}'` : '';
  const url = c.owner.url ?? '';
  if (fn && url) return `${fn} (${url})`;
  return fn || url || 'an unidentified code path';
}

const TEMPLATES: Record<LeakClassification, Template> = {
  'detached-dom': {
    why: (c) =>
      `The element was removed from the document, but a JavaScript reference — most often a closure, cache entry, or saved variable created by ${ownerPhrase(c)} — still points at it, so the garbage collector cannot reclaim the subtree.`,
    patch: () => ({
      language: 'ts',
      patch: `// Clear the retaining reference when the element is removed
function closeDialog() {
  dialogEl?.remove();
  savedDialogRef = null; // <- release the reference that kept the subtree alive
}`,
      rationale:
        'Nulling the retaining reference when the element leaves the DOM lets the garbage collector reclaim the whole detached subtree.',
    }),
  },
  'event-listener': {
    why: (c) =>
      `A listener registered by ${ownerPhrase(c)} was never removed. The listener function closes over its creation scope, so the handler, its captured variables, and any DOM nodes it references all stay reachable.`,
    patch: () => ({
      language: 'tsx',
      patch: `useEffect(() => {
  const onEvent = (e: Event) => { /* ... */ };
  window.addEventListener('resize', onEvent);
  return () => window.removeEventListener('resize', onEvent); // <- cleanup
}, []);`,
      rationale:
        'Returning a cleanup function from useEffect removes the listener on unmount, releasing the closure and everything it captured.',
    }),
  },
  'collection-growth': {
    why: (c) =>
      `The collection gained ${c.count} entries between snapshots (${formatBytes(c.retainedBytes)}) and nothing evicts them. Unbounded caches and logs are the most common cause of steady heap growth.`,
    patch: () => ({
      language: 'ts',
      patch: `// Bound the cache: evict the oldest entry beyond a limit
const MAX_ENTRIES = 500;
function cacheSet(key: string, value: unknown) {
  if (cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value); // LRU-ish eviction
  }
  cache.set(key, value);
}`,
      rationale:
        'Bounding the collection (or keying it with WeakMap so entries die with their owners) stops unbounded growth.',
    }),
  },
  timer: {
    why: (c) =>
      `An interval created by ${ownerPhrase(c)} is still running with no clearInterval. Its callback closure — and all state it captured — stays alive for as long as the timer runs.`,
    patch: () => ({
      language: 'tsx',
      patch: `useEffect(() => {
  const id = setInterval(poll, 5000);
  return () => clearInterval(id); // <- cleanup
}, []);`,
      rationale: 'Clearing the interval on unmount releases the callback closure and its captured state.',
    }),
  },
  observer: {
    why: (c) =>
      `An observer created by ${ownerPhrase(c)} is still observing with no disconnect() call. Observers keep both their callback and their observed targets reachable.`,
    patch: () => ({
      language: 'tsx',
      patch: `useEffect(() => {
  const ro = new ResizeObserver(onResize);
  ro.observe(elementRef.current!);
  return () => ro.disconnect(); // <- cleanup
}, []);`,
      rationale: 'Disconnecting on unmount releases the observer, its callback, and the observed elements.',
    }),
  },
  closure: {
    why: (c) =>
      `A closure created by ${ownerPhrase(c)} captures large data (${formatBytes(c.retainedBytes)} retained) and is itself kept alive — typically by a listener, timer, cache, or promise chain — so the captured data can never be collected.`,
    patch: () => ({
      language: 'ts',
      patch: `// Capture only what the callback needs, not the whole dataset
const summary = summarize(largeDataset); // extract the small part
onDone(() => report(summary));           // closure captures 'summary', not 'largeDataset'`,
      rationale:
        'Restructuring so the long-lived closure captures a small derived value instead of the large object releases the bulk of the memory.',
    }),
  },
  'react-fiber': {
    why: (c) =>
      `${c.count} React fiber nodes are retained and the count grew between snapshots. Unmounted component trees are usually kept by refs, contexts, subscriptions, or external stores that were never cleaned up.`,
    patch: () => ({
      language: 'tsx',
      patch: `useEffect(() => {
  const unsubscribe = store.subscribe(onChange);
  return () => unsubscribe(); // <- release the component from the store
}, []);`,
      rationale:
        'Unsubscribing on unmount removes the external reference that keeps the unmounted fiber tree reachable.',
    }),
  },
};

/** Deterministic, offline explanation engine keyed on leak classification. */
export class HeuristicProvider implements ExplanationProvider {
  async explain(c: LeakCandidate): Promise<Explanation> {
    const t = TEMPLATES[c.classification];
    return {
      summary: `${c.title} — about ${formatBytes(c.retainedBytes)} retained across ${c.count} object(s), detected with ${c.confidence}% confidence.`,
      why: t.why(c),
      where: `${ownerPhrase(c)}${c.evidence.creationStack?.length ? ` — created at: ${c.evidence.creationStack[0]}` : ''}`,
      recommendation: c.fixPattern,
      provider: 'heuristic',
    };
  }

  async suggestFix(c: LeakCandidate): Promise<FixSuggestion> {
    const { language, patch, rationale } = TEMPLATES[c.classification].patch(c);
    return { language, patch, rationale, provider: 'heuristic' };
  }
}
