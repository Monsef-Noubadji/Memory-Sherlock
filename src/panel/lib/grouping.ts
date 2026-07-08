import type { LeakCandidate } from '@/shared/leak';

export type GroupBy = 'severity' | 'type' | 'owner' | 'confidence';

export interface CandidateGroup {
  key: string;
  items: LeakCandidate[];
}

const CONFIDENCE_BANDS: Array<[number, string]> = [
  [85, 'High confidence (85%+)'],
  [60, 'Medium confidence (60–84%)'],
  [0, 'Low confidence (<60%)'],
];

function keyFor(c: LeakCandidate, by: GroupBy): string {
  switch (by) {
    case 'severity':
      return `Severity ${c.severity}`;
    case 'type':
      return c.classification;
    case 'owner':
      return c.owner.functionName ?? c.owner.url ?? 'Unknown owner';
    case 'confidence':
      return CONFIDENCE_BANDS.find(([min]) => c.confidence >= min)![1];
  }
}

/** Groups preserve the candidates' incoming order; groups sort by max severity desc. */
export function groupCandidates(candidates: LeakCandidate[], by: GroupBy): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const c of candidates) {
    const key = keyFor(c, by);
    let g = groups.get(key);
    if (!g) {
      g = { key, items: [] };
      groups.set(key, g);
    }
    g.items.push(c);
  }
  return [...groups.values()].sort(
    (a, b) => Math.max(...b.items.map((i) => i.severity)) - Math.max(...a.items.map((i) => i.severity)),
  );
}
