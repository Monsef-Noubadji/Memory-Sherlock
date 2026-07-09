import type { LeakCandidate, Severity } from '@/shared/leak';
import { ownerFromStack } from './owner';
import type { Detector } from './types';

const OLD_MS = 30_000;

/**
 * Confidence rubric: 85 for >= 3 live observers created from the same stack
 * (per-mount construction without disconnect); 70 for a lone observer that
 * has been observing for > 30 s.
 */
export const observerDetector: Detector = {
  id: 'observer',
  title: 'Observers',
  requires: ['agent'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const agent = ctx.agent!;
    const now = Date.now();
    const live = agent.liveObservers();
    if (live.length === 0) return [];

    // group by creation stack
    const groups = new Map<string, typeof live>();
    for (const o of live) {
      const key = `${o.observerType}|${o.stack.join('\n')}`;
      const g = groups.get(key) ?? [];
      g.push(o);
      groups.set(key, g);
    }

    const candidates: LeakCandidate[] = [];
    for (const group of groups.values()) {
      const sample = group[0];
      const repeated = group.length >= 3;
      // A single observer is only flagged once it's been alive a while;
      // repeated same-stack observers are a leak at any age.
      if (!repeated && now - sample.createdAt <= OLD_MS) continue;
      const severity: Severity = group.length >= 10 ? 4 : group.length >= 3 ? 3 : 1;
      candidates.push({
        id: `observer:${sample.observerType}:${sample.stack[0] ?? sample.id}`,
        classification: 'observer',
        title: repeated
          ? `${group.length}× ${sample.observerType} never disconnected`
          : `${sample.observerType} observing for ${Math.round((now - sample.createdAt) / 1000)}s`,
        severity,
        confidence: repeated ? 85 : 70,
        retainedBytes: 0,
        count: group.length,
        owner: ownerFromStack(sample.stack),
        evidence: {
          creationStack: sample.stack,
          detail: `${group.length} ${sample.observerType}(s) are still observing with no disconnect() call. Observers keep both their callback and their observed targets reachable.`,
        },
        fixPattern: 'Call observer.disconnect() when the component unmounts (useEffect cleanup).',
        docsUrl: 'https://developer.mozilla.org/docs/Web/API/ResizeObserver/disconnect',
        detectorId: 'observer',
      });
    }
    return candidates;
  },
};
