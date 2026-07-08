import { ClaudeProvider } from './claude';
import { HeuristicProvider } from './heuristic';
import type { ExplanationProvider } from './types';

/** Heuristics by default; Claude when the user configured an API key. */
export function createProvider(apiKey: string | undefined | null): ExplanationProvider {
  if (apiKey && apiKey.trim().length > 0) return new ClaudeProvider(apiKey.trim());
  return new HeuristicProvider();
}

export { ClaudeProvider } from './claude';
export { HeuristicProvider } from './heuristic';
export type { Explanation, ExplanationProvider, FixSuggestion, ProviderKind } from './types';
