import { severityFromBytes, type LeakCandidate } from '@/shared/leak';
import { ownerFromRetainerPath } from './owner';
import type { Detector } from './types';

/**
 * Confidence rubric: 95 when a strong retainer path to the GC root exists
 * (we can prove what keeps the subtree alive); 70 when the subtree is
 * detached but no strong path was resolved (weak/heuristic retention).
 */
export const detachedDomDetector: Detector = {
  id: 'detached-dom',
  title: 'Detached DOM',
  requires: ['heap'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const heap = ctx.heap!;
    const { subtrees } = await heap.detached();
    const candidates: LeakCandidate[] = [];
    for (const s of subtrees) {
      const { path } = await heap.retainers(s.representative.id);
      const hasStrongPath = path.length > 1;
      candidates.push({
        id: `detached-dom:${s.representative.id}`,
        classification: 'detached-dom',
        title: s.representative.name.replace(/^Detached\s+/, 'Detached '),
        severity: severityFromBytes(s.retainedBytes),
        confidence: hasStrongPath ? 95 : 70,
        retainedBytes: s.retainedBytes,
        count: s.count,
        owner: ownerFromRetainerPath(path),
        evidence: {
          retainerPath: path,
          detail: `${s.count} detached node(s); children: ${s.childNames.slice(0, 5).join(', ') || 'none'}`,
        },
        fixPattern: 'Release the reference that retains this subtree (clear the variable, remove the listener, or null the cache entry) when the element is removed.',
        docsUrl: 'https://developer.chrome.com/docs/devtools/memory-problems/#detached',
        detectorId: 'detached-dom',
      });
    }
    return candidates;
  },
};
