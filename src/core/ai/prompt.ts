import type { LeakCandidate } from '@/shared/leak';
import type { Explanation, FixSuggestion, ModelInfo } from './types';

export const EXPLAIN_SYSTEM =
  'You are a browser memory-leak analysis expert inside a DevTools extension. Explain leaks precisely and concretely for senior frontend engineers, grounded strictly in the evidence given. Respond with a single JSON object and nothing else.';

export const FIX_SYSTEM =
  'You are a browser memory-leak fixing expert. Produce a minimal, concrete code patch for the leak evidence given. Prefer idiomatic fixes (useEffect cleanup, AbortController, WeakMap). Respond with a single JSON object and nothing else.';

/** Only structured evidence is sent — stacks, URLs, sizes; never page content. */
export function evidencePrompt(c: LeakCandidate): string {
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

export function explainUserPrompt(c: LeakCandidate): string {
  return `Explain this memory leak. Return JSON with keys: summary, why, where, recommendation.\n${evidencePrompt(c)}`;
}

export function fixUserPrompt(c: LeakCandidate): string {
  return `Suggest a fix for this memory leak. Return JSON with keys: language, patch, rationale.\n${evidencePrompt(c)}`;
}

/** Tolerant JSON extraction: accepts a bare object or one fenced in ```json. */
export function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function isExplanation(v: unknown): v is Omit<Explanation, 'provider'> {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.summary === 'string' && typeof o.why === 'string' && typeof o.where === 'string' && typeof o.recommendation === 'string';
}

export function isFix(v: unknown): v is Omit<FixSuggestion, 'provider'> {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.language === 'string' && typeof o.patch === 'string' && typeof o.rationale === 'string';
}

/** Turns an NVIDIA/OpenAI model id like "meta/llama-3.3-70b-instruct" into a readable label. */
export function labelForModel(id: string): string {
  const tail = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
  return tail
    .replace(/[-_]/g, ' ')
    .replace(/\b(\d+b)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toModelInfo(id: string): ModelInfo {
  return { id, label: labelForModel(id) };
}
