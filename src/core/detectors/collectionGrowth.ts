import { severityFromBytes, formatBytes, type LeakCandidate } from '@/shared/leak';
import type { Detector } from './types';

const COLLECTION_NAMES = new Set(['Map', 'Set', 'Array', 'Object', 'WeakMap', 'WeakSet']);
const SIZE_THRESHOLD = 50 * 1024;
const COUNT_THRESHOLD_OTHER = 50;

/**
 * Confidence rubric: 60 for a single confirming snapshot pair. (With more
 * pairs this would climb +10 per pair toward 85 — MVP diffs one pair.)
 */
export const collectionGrowthDetector: Detector = {
  id: 'collection-growth',
  title: 'Growing Collections',
  requires: ['diff'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const candidates: LeakCandidate[] = [];
    for (const row of ctx.diff!) {
      if (row.countDelta <= 0 || row.sizeDelta <= SIZE_THRESHOLD) continue;
      const isCollection = COLLECTION_NAMES.has(row.name);
      if (!isCollection && row.countDelta < COUNT_THRESHOLD_OTHER) continue;
      candidates.push({
        id: `collection-growth:${row.name}`,
        classification: 'collection-growth',
        title: `${row.name} grew by ${row.countDelta} instances (${formatBytes(row.sizeDelta)})`,
        severity: severityFromBytes(row.sizeDelta),
        confidence: 60,
        retainedBytes: row.sizeDelta,
        count: row.countDelta,
        owner: {},
        evidence: {
          detail: `Between the two snapshots, ${row.name} gained ${row.addedCount} instances and lost ${row.removedCount} — net +${row.countDelta}, +${formatBytes(row.sizeDelta)} shallow. Monotonic growth of this shape usually means an unbounded cache or log.`,
        },
        fixPattern: 'Bound the collection: evict old entries (LRU), key caches with WeakMap/WeakRef, or clear it when its owner unmounts.',
        docsUrl: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/WeakMap',
        detectorId: 'collection-growth',
      });
    }
    return candidates.sort((a, b) => b.retainedBytes - a.retainedBytes);
  },
};
