import { severityFromBytes, formatBytes, type LeakCandidate } from '@/shared/leak';
import type { Detector } from './types';

const RETAINED_THRESHOLD = 250 * 1024;

/**
 * Confidence rubric: 65 for closures retaining > 250 KB whose constructor
 * grew across the snapshot diff. Large-but-stable closures are not flagged.
 */
export const closureDetector: Detector = {
  id: 'closure',
  title: 'Closure Retention',
  requires: ['heap', 'diff'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const heap = ctx.heap!;
    const growing = new Set(
      ctx.diff!.filter((r) => r.countDelta > 0 || r.sizeDelta > 0).map((r) => r.name),
    );
    const { rows } = await heap.aggregate(undefined, 'retained', 0, 500);
    const candidates: LeakCandidate[] = [];
    for (const row of rows) {
      if (!row.name.endsWith('()')) continue; // closure grouping key
      if (row.retained <= RETAINED_THRESHOLD) continue;
      if (!growing.has(row.name)) continue;
      const fnName = row.name.slice(0, -2);
      // surface what the biggest instance captures
      const { rows: instances } = await heap.nodes(row.name, 0, 1);
      let captured: string[] = [];
      let retainerDetail = '';
      if (instances.length > 0) {
        const ret = await heap.retainers(instances[0].id);
        retainerDetail = ret.path
          .slice(1, 3)
          .map((s) => `${s.nodeName} (${s.edgeName})`)
          .join(' ← ');
        captured = ret.retainers.map((r) => r.edgeName).slice(0, 8);
      }
      candidates.push({
        id: `closure:${row.name}`,
        classification: 'closure',
        title: `Closure '${fnName}' retains ${formatBytes(row.retained)}`,
        severity: severityFromBytes(row.retained),
        confidence: 65,
        retainedBytes: row.retained,
        count: row.count,
        owner: { functionName: fnName },
        evidence: {
          detail: `${row.count} instance(s) of '${fnName}' retain ${formatBytes(row.retained)} total and the count grew between snapshots.${retainerDetail ? ` Retained via: ${retainerDetail}.` : ''}${captured.length ? ` Captured references: ${captured.join(', ')}.` : ''}`,
        },
        fixPattern: 'Avoid capturing large objects in long-lived callbacks; null out references in cleanup, or restructure so the closure only captures what it needs.',
        docsUrl: 'https://developer.chrome.com/docs/devtools/memory-problems/',
        detectorId: 'closure',
      });
    }
    return candidates;
  },
};
