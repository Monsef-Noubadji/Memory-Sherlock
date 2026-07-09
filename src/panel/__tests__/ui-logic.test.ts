import { describe, it, expect, vi } from 'vitest';
import { leakScore, scoreTone } from '../lib/leakScore';
import { groupCandidates } from '../lib/grouping';
import { buildMarkdownReport } from '../lib/report';
import { createSettingsStore } from '../stores/settings';
import type { LeakCandidate } from '@/shared/leak';

function candidate(over: Partial<LeakCandidate>): LeakCandidate {
  return {
    id: Math.random().toString(36).slice(2),
    classification: 'timer',
    title: 'Test leak',
    severity: 3,
    confidence: 80,
    retainedBytes: 1024,
    count: 1,
    owner: {},
    evidence: {},
    fixPattern: 'fix it',
    detectorId: 'timer',
    ...over,
  };
}

describe('leakScore', () => {
  it('is 0 for a clean page and capped at 100', () => {
    expect(leakScore([])).toBe(0);
    const many = Array.from({ length: 20 }, () => candidate({ severity: 5, confidence: 100 }));
    expect(leakScore(many)).toBe(100);
  });

  it('weighs severity and confidence', () => {
    const small = leakScore([candidate({ severity: 1, confidence: 50 })]);
    const big = leakScore([candidate({ severity: 5, confidence: 95 })]);
    expect(big).toBeGreaterThan(small);
    expect(scoreTone(big)).not.toBe('success');
    expect(scoreTone(0)).toBe('success');
  });
});

describe('groupCandidates', () => {
  const list = [
    candidate({ severity: 5, classification: 'detached-dom', confidence: 95, owner: { functionName: 'a' } }),
    candidate({ severity: 2, classification: 'timer', confidence: 55, owner: { functionName: 'b' } }),
    candidate({ severity: 5, classification: 'detached-dom', confidence: 70, owner: { functionName: 'a' } }),
  ];

  it('groups by type with highest-severity group first', () => {
    const groups = groupCandidates(list, 'type');
    expect(groups[0].key).toBe('detached-dom');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].key).toBe('timer');
  });

  it('groups by confidence bands and by owner', () => {
    const byConf = groupCandidates(list, 'confidence');
    expect(byConf.map((g) => g.key)).toContain('High confidence (85%+)');
    const byOwner = groupCandidates(list, 'owner');
    expect(byOwner.find((g) => g.key === 'a')!.items).toHaveLength(2);
  });
});

describe('buildMarkdownReport', () => {
  it('renders candidates with explanations and patches', () => {
    const md = buildMarkdownReport(
      [
        {
          candidate: candidate({ title: 'Detached dialog', severity: 4, retainedBytes: 2.4 * 1024 * 1024 }),
          explanation: {
            summary: 'A dialog leaks.',
            why: 'because',
            where: 'Dialog.tsx',
            recommendation: 'clean up',
            provider: 'heuristic',
          },
          fix: { language: 'tsx', patch: 'return () => {}', rationale: 'cleanup', provider: 'heuristic' },
        },
      ],
      'https://example.com',
    );
    expect(md).toContain('# Memory Sherlock Report');
    expect(md).toContain('## Detached dialog');
    expect(md).toContain('★★★★☆');
    expect(md).toContain('2.4 MB');
    expect(md).toContain('```tsx');
    expect(md).toContain('https://example.com');
  });
});

function fakeBackend(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
  };
}

describe('settings store', () => {
  it('persists provider config and builds the AI config', async () => {
    const backend = fakeBackend({});
    const store = createSettingsStore(backend);
    await new Promise((r) => setTimeout(r, 0));

    store.getState().setProvider('nvidia');
    store.getState().setKey('nvidia', 'nvapi-abc');
    store.getState().setModel('nvidia', 'deepseek-ai/deepseek-r1');
    expect(backend.set).toHaveBeenCalledWith({ provider: 'nvidia' });
    expect(backend.set).toHaveBeenCalledWith({ nvidiaKey: 'nvapi-abc' });

    const cfg = store.getState().providerConfig();
    expect(cfg).toMatchObject({ active: 'nvidia', nvidiaKey: 'nvapi-abc', nvidiaModel: 'deepseek-ai/deepseek-r1' });

    store.getState().setSamplingInterval(5000);
    expect(backend.set).toHaveBeenCalledWith({ samplingIntervalMs: 5000 });
    store.getState().toggleDetector('timer');
    expect(store.getState().disabledDetectors).toEqual(['timer']);
    store.getState().toggleDetector('timer');
    expect(store.getState().disabledDetectors).toEqual([]);
  });

  it('migrates a legacy apiKey into claudeKey and activates Claude', async () => {
    const store = createSettingsStore(fakeBackend({ apiKey: 'sk-legacy' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().claudeKey).toBe('sk-legacy');
    expect(store.getState().provider).toBe('claude');
    expect(store.getState().providerConfig().active).toBe('claude');
  });

  it('defaults to the heuristic provider with no saved config', async () => {
    const store = createSettingsStore(fakeBackend({}));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().provider).toBe('heuristic');
  });
});
