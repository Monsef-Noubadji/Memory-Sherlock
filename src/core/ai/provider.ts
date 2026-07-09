import { ClaudeProvider } from './claude';
import { NvidiaProvider } from './nvidia';
import { HeuristicProvider } from './heuristic';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_NVIDIA_MODEL } from './types';
import type { ExplanationProvider, KeyedProvider, ProviderConfig, ProviderKind, ValidationResult } from './types';

/** Builds the active explanation provider from the saved config. */
export function createProvider(config: ProviderConfig): ExplanationProvider {
  switch (config.active) {
    case 'claude':
      if (config.claudeKey.trim()) {
        return new ClaudeProvider(config.claudeKey.trim(), { model: config.claudeModel || DEFAULT_CLAUDE_MODEL });
      }
      break;
    case 'nvidia':
      if (config.nvidiaKey.trim()) {
        return new NvidiaProvider(config.nvidiaKey.trim(), config.nvidiaModel || DEFAULT_NVIDIA_MODEL);
      }
      break;
    case 'heuristic':
      break;
  }
  return new HeuristicProvider();
}

/** Validates a key for one provider and returns the models it can access. */
export function validateProviderKey(
  provider: Exclude<ProviderKind, 'heuristic'>,
  key: string,
  model?: string,
): Promise<ValidationResult> {
  if (!key.trim()) return Promise.resolve({ ok: false, error: 'Enter a key first' });
  const p: KeyedProvider =
    provider === 'claude'
      ? new ClaudeProvider(key.trim(), { model })
      : new NvidiaProvider(key.trim(), model ?? DEFAULT_NVIDIA_MODEL);
  return p.validate();
}

export { ClaudeProvider } from './claude';
export { NvidiaProvider } from './nvidia';
export { HeuristicProvider } from './heuristic';
export { DEFAULT_CLAUDE_MODEL, DEFAULT_NVIDIA_MODEL } from './types';
export type {
  Explanation,
  ExplanationProvider,
  FixSuggestion,
  KeyedProvider,
  ModelInfo,
  ProviderConfig,
  ProviderKind,
  ValidationResult,
} from './types';
