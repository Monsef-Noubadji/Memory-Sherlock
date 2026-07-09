import { HeuristicProvider } from './heuristic';
import {
  EXPLAIN_SYSTEM,
  FIX_SYSTEM,
  explainUserPrompt,
  fixUserPrompt,
  isExplanation,
  isFix,
  parseJsonObject,
  toModelInfo,
} from './prompt';
import type { LeakCandidate } from '@/shared/leak';
import type { Explanation, ExplanationProvider, FixSuggestion, KeyedProvider, ValidationResult } from './types';

const BASE_URL = 'https://integrate.api.nvidia.com/v1';
const TIMEOUT_MS = 20_000;

interface ChatChoice {
  message?: { content?: string };
  finish_reason?: string;
}
interface ChatCompletion {
  choices?: ChatChoice[];
}
interface ModelList {
  data?: Array<{ id: string }>;
}

/**
 * NVIDIA NIM provider — OpenAI-compatible chat completions against
 * integrate.api.nvidia.com. Serves open models (Llama, DeepSeek, Qwen,
 * Nemotron, …). Any failure falls back to the heuristic provider.
 */
export class NvidiaProvider implements KeyedProvider {
  readonly kind = 'nvidia' as const;
  private fetchImpl: typeof fetch;
  private fallback: ExplanationProvider;

  constructor(
    private apiKey: string,
    readonly model: string,
    opts: { fetch?: typeof fetch; fallback?: ExplanationProvider } = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.fallback = opts.fallback ?? new HeuristicProvider();
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }

  private async withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await run(ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async validate(): Promise<ValidationResult> {
    try {
      const res = await this.withTimeout((signal) =>
        this.fetchImpl(`${BASE_URL}/models`, { headers: this.headers(), signal }),
      );
      if (!res.ok) {
        return { ok: false, error: `Key rejected (HTTP ${res.status})` };
      }
      const body = (await res.json()) as ModelList;
      const models = (body.data ?? [])
        .map((m) => m.id)
        .filter((id) => typeof id === 'string')
        .sort()
        .map(toModelInfo);
      if (models.length === 0) return { ok: false, error: 'Key valid but no models available' };
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  private async chat<T>(system: string, user: string, validate: (v: unknown) => v is T): Promise<T | null> {
    try {
      const res = await this.withTimeout((signal) =>
        this.fetchImpl(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: this.headers(),
          signal,
          body: JSON.stringify({
            model: this.model,
            temperature: 0.2,
            max_tokens: 1024,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        }),
      );
      if (!res.ok) return null;
      const body = (await res.json()) as ChatCompletion;
      const content = body.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = parseJsonObject<unknown>(content);
      return parsed !== null && validate(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async explain(c: LeakCandidate): Promise<Explanation> {
    const result = await this.chat(EXPLAIN_SYSTEM, explainUserPrompt(c), isExplanation);
    if (!result) return this.fallback.explain(c);
    return { ...result, provider: 'nvidia' };
  }

  async suggestFix(c: LeakCandidate): Promise<FixSuggestion> {
    const result = await this.chat(FIX_SYSTEM, fixUserPrompt(c), isFix);
    if (!result) return this.fallback.suggestFix(c);
    return { ...result, provider: 'nvidia' };
  }
}
