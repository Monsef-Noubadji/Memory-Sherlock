import { describe, it, expect, vi } from 'vitest';
import { HeuristicProvider } from '../heuristic';
import { ClaudeProvider } from '../claude';
import type { LeakCandidate, LeakClassification } from '@/shared/leak';

function candidate(classification: LeakClassification): LeakCandidate {
  return {
    id: `${classification}:test`,
    classification,
    title: `Test ${classification}`,
    severity: 3,
    confidence: 90,
    retainedBytes: 600 * 1024,
    count: 2,
    owner: { functionName: 'showDialog', url: 'http://app/Dialog.tsx:12' },
    evidence: {
      creationStack: ['at showDialog (http://app/Dialog.tsx:12:3)'],
      detail: 'Test evidence detail.',
    },
    fixPattern: 'Remove the listener on unmount.',
    detectorId: classification,
  };
}

const ALL: LeakClassification[] = [
  'detached-dom',
  'event-listener',
  'collection-growth',
  'timer',
  'observer',
  'closure',
  'react-fiber',
];

describe('HeuristicProvider', () => {
  const provider = new HeuristicProvider();

  it('produces a complete explanation for every classification', async () => {
    for (const c of ALL) {
      const e = await provider.explain(candidate(c));
      expect(e.summary.length, c).toBeGreaterThan(10);
      expect(e.why.length, c).toBeGreaterThan(10);
      expect(e.where.length, c).toBeGreaterThan(5);
      expect(e.recommendation.length, c).toBeGreaterThan(10);
      expect(e.provider).toBe('heuristic');
    }
  });

  it('produces a code patch for every classification', async () => {
    for (const c of ALL) {
      const f = await provider.suggestFix(candidate(c));
      expect(f.patch.length, c).toBeGreaterThan(20);
      expect(f.rationale.length, c).toBeGreaterThan(10);
      expect(f.provider).toBe('heuristic');
    }
  });

  it('references the owner in the explanation when known', async () => {
    const e = await provider.explain(candidate('event-listener'));
    expect(`${e.where} ${e.why}`).toContain('Dialog.tsx');
  });
});

function apiResponse(body: object) {
  return new Response(
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-4-8',
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('ClaudeProvider', () => {
  it('returns the model explanation on success', async () => {
    const fetchMock = vi.fn(async () =>
      apiResponse({
        summary: 'A dialog leaks.',
        why: 'A resize listener closure retains it.',
        where: 'Dialog.tsx line 12.',
        recommendation: 'Return a cleanup function.',
      }),
    );
    const provider = new ClaudeProvider('sk-test', { fetch: fetchMock as typeof fetch });
    const e = await provider.explain(candidate('event-listener'));
    expect(e.summary).toBe('A dialog leaks.');
    expect(e.provider).toBe('claude');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to the heuristic provider when the API fails', async () => {
    const fetchMock = vi.fn(async () => new Response('overloaded', { status: 529 }));
    const provider = new ClaudeProvider('sk-test', { fetch: fetchMock as typeof fetch });
    const e = await provider.explain(candidate('timer'));
    expect(e.provider).toBe('heuristic');
    expect(e.summary.length).toBeGreaterThan(10);
  });

  it('falls back when the API returns a refusal', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-4-8',
          content: [],
          stop_reason: 'refusal',
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new ClaudeProvider('sk-test', { fetch: fetchMock as typeof fetch });
    const e = await provider.explain(candidate('closure'));
    expect(e.provider).toBe('heuristic');
  });

  it('produces fixes through the API with heuristic fallback', async () => {
    const fetchMock = vi.fn(async () =>
      apiResponse({
        language: 'tsx',
        patch: 'useEffect(() => {\n  window.addEventListener("resize", onResize);\n  return () => window.removeEventListener("resize", onResize);\n}, []);',
        rationale: 'The cleanup removes the listener.',
      }),
    );
    const provider = new ClaudeProvider('sk-test', { fetch: fetchMock as typeof fetch });
    const f = await provider.suggestFix(candidate('event-listener'));
    expect(f.patch).toContain('removeEventListener');
    expect(f.provider).toBe('claude');
  });
});
