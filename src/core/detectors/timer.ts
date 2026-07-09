import type { LeakCandidate, Severity } from '@/shared/leak';
import { ownerFromStack } from './owner';
import type { Detector } from './types';

const OLD_MS = 30_000;

/**
 * Confidence rubric: 80 for >= 3 live intervals created from the same stack
 * (per-mount interval without cleanup); 55 for a lone interval older than
 * 30 s (might be intentional polling — flagged for review).
 */
export const timerDetector: Detector = {
  id: 'timer',
  title: 'Timers',
  requires: ['agent'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const agent = ctx.agent!;
    const now = Date.now();
    const liveIntervals = agent.liveTimers().filter((t) => t.timerKind === 'interval');
    if (liveIntervals.length === 0) return [];

    const candidates: LeakCandidate[] = [];
    const inRepeat = new Set<number>();
    // Repeated registrations from one call site are a leak at any age.
    const allLiveIds = new Set(liveIntervals.map((t) => t.id));

    for (const sig of agent.repeatSignatures('timer', 3)) {
      const ids = sig.ids.filter((id) => allLiveIds.has(id));
      if (ids.length < 3) continue;
      for (const id of ids) inRepeat.add(id);
      const severity: Severity = ids.length >= 10 ? 4 : 3;
      candidates.push({
        id: `timer:repeat:${sig.signature[0] ?? 'unknown'}`,
        classification: 'timer',
        title: `${ids.length}× live intervals from the same code path`,
        severity,
        confidence: 80,
        retainedBytes: 0,
        count: ids.length,
        owner: ownerFromStack(sig.signature),
        evidence: {
          creationStack: sig.signature,
          detail: `${ids.length} setInterval timers from one call site are still running — each keeps its callback closure (and captured state) alive.`,
        },
        fixPattern: 'Store the interval id and call clearInterval on unmount (useEffect cleanup).',
        docsUrl: 'https://developer.mozilla.org/docs/Web/API/clearInterval',
        detectorId: 'timer',
      });
    }

    for (const t of liveIntervals) {
      if (inRepeat.has(t.id)) continue;
      if (now - t.setAt <= OLD_MS) continue; // lone interval: only flag if long-lived
      candidates.push({
        id: `timer:lone:${t.id}`,
        classification: 'timer',
        title: `Long-lived interval (${Math.round((now - t.setAt) / 1000)}s)`,
        severity: 1,
        confidence: 55,
        retainedBytes: 0,
        count: 1,
        owner: ownerFromStack(t.stack),
        evidence: {
          creationStack: t.stack,
          detail: 'A setInterval has been running since page load without being cleared. If it belongs to an unmounted view, it leaks its closure.',
        },
        fixPattern: 'Confirm the interval is intentional; otherwise clearInterval when its owner goes away.',
        docsUrl: 'https://developer.mozilla.org/docs/Web/API/clearInterval',
        detectorId: 'timer',
      });
    }
    return candidates;
  },
};
