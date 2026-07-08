import type { LeakCandidate } from '@/shared/leak';

/**
 * 0–100 health score: each candidate contributes proportionally to its
 * severity and confidence. One confident critical leak (~sev 5, 95%) adds
 * ~19 points; a page with 5 such leaks maxes out.
 */
export function leakScore(candidates: LeakCandidate[]): number {
  const raw = candidates.reduce(
    (sum, c) => sum + (c.severity / 5) * (c.confidence / 100) * 20,
    0,
  );
  return Math.min(100, Math.round(raw));
}

export function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score < 15) return 'success';
  if (score < 55) return 'warning';
  return 'danger';
}
