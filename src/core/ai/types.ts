import type { LeakCandidate } from '@/shared/leak';

export type ProviderKind = 'heuristic' | 'claude' | 'nvidia';

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

/** A model the user can pick, as returned by a provider's model listing. */
export interface ModelInfo {
  id: string;
  label: string;
}

export type ValidationResult =
  | { ok: true; models: ModelInfo[] }
  | { ok: false; error: string };

/**
 * A keyed cloud provider (Claude, NVIDIA) that can validate its key and list
 * the models available to that key. Heuristic is not a KeyedProvider.
 */
export interface KeyedProvider extends ExplanationProvider {
  readonly kind: Exclude<ProviderKind, 'heuristic'>;
  readonly model: string;
  /** Checks the key and returns the models it can access. */
  validate(): Promise<ValidationResult>;
}

/** Persisted per-provider configuration. */
export interface ProviderConfig {
  active: ProviderKind;
  claudeKey: string;
  claudeModel: string;
  nvidiaKey: string;
  nvidiaModel: string;
}

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';
export const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
