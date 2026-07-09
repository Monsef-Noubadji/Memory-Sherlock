import Anthropic from '@anthropic-ai/sdk';
import { HeuristicProvider } from './heuristic';
import { EXPLAIN_SYSTEM, FIX_SYSTEM, explainUserPrompt, fixUserPrompt } from './prompt';
import { DEFAULT_CLAUDE_MODEL } from './types';
import type { LeakCandidate } from '@/shared/leak';
import type {
  Explanation,
  ExplanationProvider,
  FixSuggestion,
  KeyedProvider,
  ModelInfo,
  ValidationResult,
} from './types';

const TIMEOUT_MS = 15_000;

const EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One-sentence summary of what is leaking' },
    why: { type: 'string', description: 'Why the memory cannot be collected' },
    where: { type: 'string', description: 'Where in the code the leak originates' },
    recommendation: { type: 'string', description: 'How to fix it' },
  },
  required: ['summary', 'why', 'where', 'recommendation'],
  additionalProperties: false,
} satisfies Record<string, unknown>;

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string', description: 'Language of the patch, e.g. tsx' },
    patch: { type: 'string', description: 'A concrete code patch fixing the leak' },
    rationale: { type: 'string', description: 'Why this patch fixes the leak' },
  },
  required: ['language', 'patch', 'rationale'],
  additionalProperties: false,
} satisfies Record<string, unknown>;

/**
 * Claude provider. Any failure (network, timeout, refusal, schema mismatch)
 * falls back to the deterministic heuristic provider so the AI Inspector
 * always renders something.
 */
export class ClaudeProvider implements KeyedProvider {
  readonly kind = 'claude' as const;
  readonly model: string;
  private client: Anthropic;
  private fallback: ExplanationProvider;

  constructor(
    apiKey: string,
    opts: { model?: string; fetch?: typeof fetch; fallback?: ExplanationProvider } = {},
  ) {
    this.model = opts.model ?? DEFAULT_CLAUDE_MODEL;
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true, // DevTools panel context; key is user-supplied and stored locally
      timeout: TIMEOUT_MS,
      maxRetries: 1,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
    this.fallback = opts.fallback ?? new HeuristicProvider();
  }

  async validate(): Promise<ValidationResult> {
    try {
      const models: ModelInfo[] = [];
      for await (const m of this.client.models.list()) {
        models.push({ id: m.id, label: m.display_name ?? m.id });
      }
      if (models.length === 0) return { ok: false, error: 'Key valid but no models available' };
      return { ok: true, models };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Invalid API key' };
      if (err instanceof Anthropic.APIError) return { ok: false, error: `Key rejected (HTTP ${err.status ?? '?'})` };
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  private async ask<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: user }],
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') return null;
      return JSON.parse(text.text) as T;
    } catch {
      return null;
    }
  }

  async explain(c: LeakCandidate): Promise<Explanation> {
    const result = await this.ask<Omit<Explanation, 'provider'>>(EXPLAIN_SYSTEM, explainUserPrompt(c), EXPLANATION_SCHEMA);
    if (!result) return this.fallback.explain(c);
    return { ...result, provider: 'claude' };
  }

  async suggestFix(c: LeakCandidate): Promise<FixSuggestion> {
    const result = await this.ask<Omit<FixSuggestion, 'provider'>>(FIX_SYSTEM, fixUserPrompt(c), FIX_SCHEMA);
    if (!result) return this.fallback.suggestFix(c);
    return { ...result, provider: 'claude' };
  }
}
