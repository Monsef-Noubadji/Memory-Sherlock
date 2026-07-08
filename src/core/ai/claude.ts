import Anthropic from '@anthropic-ai/sdk';
import { HeuristicProvider } from './heuristic';
import type { LeakCandidate } from '@/shared/leak';
import type { Explanation, ExplanationProvider, FixSuggestion } from './types';

const MODEL = 'claude-opus-4-8';
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

function evidencePrompt(c: LeakCandidate): string {
  // Only structured evidence is sent — stacks, URLs, sizes; never page content.
  return JSON.stringify(
    {
      classification: c.classification,
      title: c.title,
      severity: c.severity,
      confidence: c.confidence,
      retainedBytes: c.retainedBytes,
      count: c.count,
      owner: c.owner,
      evidence: c.evidence,
      suggestedFixPattern: c.fixPattern,
    },
    null,
    2,
  );
}

/**
 * LLM-backed explanation provider. Any failure (network, timeout, refusal,
 * schema mismatch) falls back to the deterministic heuristic provider so the
 * AI Inspector always renders something.
 */
export class ClaudeProvider implements ExplanationProvider {
  private client: Anthropic;
  private fallback: ExplanationProvider;

  constructor(apiKey: string, opts: { fetch?: typeof fetch; fallback?: ExplanationProvider } = {}) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true, // DevTools panel context; key is user-supplied and stored locally
      timeout: TIMEOUT_MS,
      maxRetries: 1,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
    this.fallback = opts.fallback ?? new HeuristicProvider();
  }

  private async ask<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null> {
    try {
      const response = await this.client.messages.create({
        model: MODEL,
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
    const result = await this.ask<Omit<Explanation, 'provider'>>(
      'You are a browser memory-leak analysis expert inside a DevTools extension. Explain leaks precisely and concretely for senior frontend engineers, grounded strictly in the evidence given.',
      `Explain this memory leak:\n${evidencePrompt(c)}`,
      EXPLANATION_SCHEMA,
    );
    if (!result) return this.fallback.explain(c);
    return { ...result, provider: 'claude' };
  }

  async suggestFix(c: LeakCandidate): Promise<FixSuggestion> {
    const result = await this.ask<Omit<FixSuggestion, 'provider'>>(
      'You are a browser memory-leak fixing expert. Produce a minimal, concrete code patch for the leak evidence given. Prefer idiomatic fixes (useEffect cleanup, AbortController, WeakMap).',
      `Suggest a fix for this memory leak:\n${evidencePrompt(c)}`,
      FIX_SCHEMA,
    );
    if (!result) return this.fallback.suggestFix(c);
    return { ...result, provider: 'claude' };
  }
}
