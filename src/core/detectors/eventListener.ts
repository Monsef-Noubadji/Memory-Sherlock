import type { LeakCandidate, Severity } from '@/shared/leak';
import { ownerFromStack } from './owner';
import type { Detector } from './types';

/**
 * Confidence rubric: 90 when the listener's DOM target was removed while the
 * listener was never unregistered (direct evidence of missing cleanup);
 * 75 for window/document listeners registered >= 3 times from the same
 * creation stack (repeat-mount signature without cleanup).
 */
export const eventListenerDetector: Detector = {
  id: 'event-listener',
  title: 'Event Listeners',
  requires: ['agent'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const agent = ctx.agent!;
    const candidates: LeakCandidate[] = [];
    const flagged = new Set<number>();

    for (const l of agent.liveListeners()) {
      if (!l.targetRemoved) continue;
      flagged.add(l.id);
      candidates.push({
        id: `event-listener:removed-target:${l.id}`,
        classification: 'event-listener',
        title: `'${l.type}' listener on removed ${l.targetDesc}`,
        severity: 2,
        confidence: 90,
        retainedBytes: 0,
        count: 1,
        owner: ownerFromStack(l.stack),
        evidence: {
          creationStack: l.stack,
          detail: `Target ${l.targetDesc} left the DOM but the '${l.type}' listener was never removed; the handler (and everything it closes over) stays alive.`,
        },
        fixPattern: 'Remove the listener when the element unmounts — in React, return a cleanup function from useEffect that calls removeEventListener.',
        docsUrl: 'https://developer.mozilla.org/docs/Web/API/EventTarget/removeEventListener',
        detectorId: 'event-listener',
      });
    }

    const live = new Map(agent.liveListeners().map((l) => [l.id, l]));
    for (const sig of agent.repeatSignatures('listener', 3)) {
      const liveIds = sig.ids.filter((id) => live.has(id) && !flagged.has(id));
      if (liveIds.length < 3) continue;
      const sample = live.get(liveIds[0])!;
      if (sample.targetIsNode) continue; // only global targets for the repeat rule
      const severity: Severity = liveIds.length >= 10 ? 4 : liveIds.length >= 5 ? 3 : 2;
      candidates.push({
        id: `event-listener:repeat:${sig.signature[0] ?? 'unknown'}`,
        classification: 'event-listener',
        title: `${liveIds.length}× '${sample.type}' listeners on ${sample.targetDesc} from the same code path`,
        severity,
        confidence: 75,
        retainedBytes: 0,
        count: liveIds.length,
        owner: ownerFromStack(sig.signature),
        evidence: {
          creationStack: sig.signature,
          detail: `The same call site registered ${liveIds.length} '${sample.type}' listeners on ${sample.targetDesc} that are all still live — a per-mount registration without cleanup.`,
        },
        fixPattern: 'Register the listener once, or remove it on unmount (useEffect cleanup / AbortController signal).',
        docsUrl: 'https://developer.mozilla.org/docs/Web/API/EventTarget/addEventListener#add_an_abortable_listener',
        detectorId: 'event-listener',
      });
    }
    return candidates;
  },
};
