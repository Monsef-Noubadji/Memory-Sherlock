import type { LeakCandidate } from '@/shared/leak';

export type ProviderKind = 'heuristic' | 'claude';

export interface Explanation {
  summary: string;
  why: string;
  where: string;
  recommendation: string;
  provider: ProviderKind;
}

export interface FixSuggestion {
  language: string;
  patch: string;
  rationale: string;
  provider: ProviderKind;
}

export interface ExplanationProvider {
  explain(candidate: LeakCandidate): Promise<Explanation>;
  suggestFix(candidate: LeakCandidate): Promise<FixSuggestion>;
}
