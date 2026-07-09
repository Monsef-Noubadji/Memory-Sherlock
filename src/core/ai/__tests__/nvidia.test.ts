import { describe, it, expect, vi } from 'vitest';
import { NvidiaProvider } from '../nvidia';
import type { LeakCandidate } from '@/shared/leak';

function candidate(): LeakCandidate {
  return {
    id: 'event-listener:test',
    classification: 'event-listener',
    title: 'Listener leak',
    severity: 3,
    confidence: 90,
    retainedBytes: 1024,
    count: 1,
    owner: { functionName: 'onResize', url: 'http://app/Chart.tsx:40' },
    evidence: { creationStack: ['at onResize (http://app/Chart.tsx:40:5)'], detail: 'never removed' },
    fixPattern: 'remove on unmount',
    detectorId: 'event-listener',
  };
}

function chatResponse(obj: object) {
  return new Response(
    JSON.stringify({
      id: 'cmpl-1',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(obj) }, finish_reason: 'stop' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function modelsResponse(ids: string[]) {
  return new Response(
    JSON.stringify({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('NvidiaProvider.validate', () => {
  it('returns the model list on a valid key', async () => {
    const fetchMock = vi.fn(async () => modelsResponse(['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1']));
    const provider = new NvidiaProvider('nvapi-good', 'meta/llama-3.3-70b-instruct', { fetch: fetchMock as typeof fetch });
    const res = await provider.validate();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.models.map((m) => m.id)).toContain('deepseek-ai/deepseek-r1');
      expect(res.models[0].label).toBeTruthy();
    }
    // hits the OpenAI-compatible models endpoint with a bearer token
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer nvapi-good');
  });

  it('reports an invalid key without throwing', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const provider = new NvidiaProvider('nvapi-bad', 'meta/llama-3.3-70b-instruct', { fetch: fetchMock as typeof fetch });
    const res = await provider.validate();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/401|invalid|unauthor/i);
  });

  it('reports a network failure as an error result', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const provider = new NvidiaProvider('nvapi-x', 'm', { fetch: fetchMock as typeof fetch });
    const res = await provider.validate();
    expect(res.ok).toBe(false);
  });
});

describe('NvidiaProvider.explain / suggestFix', () => {
  it('parses a chat completion into an explanation', async () => {
    const fetchMock = vi.fn(async () =>
      chatResponse({ summary: 'A listener leaks.', why: 'not removed', where: 'Chart.tsx', recommendation: 'cleanup' }),
    );
    const provider = new NvidiaProvider('nvapi-good', 'meta/llama-3.3-70b-instruct', { fetch: fetchMock as typeof fetch });
    const e = await provider.explain(candidate());
    expect(e.provider).toBe('nvidia');
    expect(e.summary).toBe('A listener leaks.');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1/chat/completions');
    expect(JSON.parse(init.body as string).model).toBe('meta/llama-3.3-70b-instruct');
  });

  it('falls back to heuristics on API failure', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    const provider = new NvidiaProvider('nvapi-good', 'm', { fetch: fetchMock as typeof fetch });
    const e = await provider.explain(candidate());
    expect(e.provider).toBe('heuristic');
    expect(e.summary.length).toBeGreaterThan(10);
    const f = await provider.suggestFix(candidate());
    expect(f.provider).toBe('heuristic');
  });

  it('falls back when the model returns non-JSON content', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'I think the leak is...' }, finish_reason: 'stop' }] }),
        { status: 200 },
      ),
    );
    const provider = new NvidiaProvider('nvapi-good', 'm', { fetch: fetchMock as typeof fetch });
    const e = await provider.explain(candidate());
    expect(e.provider).toBe('heuristic');
  });
});
