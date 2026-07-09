import { useState } from 'react';
import { Badge, Button, SectionLabel } from '../components/primitives';
import { useSettingsState } from '../runtime';
import { allDetectors } from '@/core/detectors';
import { validateProviderKey } from '@/core/ai/provider';
import type { ModelInfo, ProviderKind } from '@/core/ai/provider';

type KeyedKind = 'claude' | 'nvidia';

interface KeyedMeta {
  kind: KeyedKind;
  name: string;
  hint: string;
  keyPlaceholder: string;
  signup: { label: string; url: string };
}

const PROVIDERS: KeyedMeta[] = [
  {
    kind: 'claude',
    name: 'Claude',
    hint: "Anthropic's models. Richest explanations and patches.",
    keyPlaceholder: 'sk-ant-…',
    signup: { label: 'console.anthropic.com', url: 'https://console.anthropic.com/settings/keys' },
  },
  {
    kind: 'nvidia',
    name: 'NVIDIA NIM',
    hint: 'Open models (Llama, DeepSeek, Qwen, Nemotron) hosted by NVIDIA.',
    keyPlaceholder: 'nvapi-…',
    signup: { label: 'build.nvidia.com', url: 'https://build.nvidia.com/' },
  },
];

export function Settings() {
  const provider = useSettingsState((s) => s.provider);
  const setProvider = useSettingsState((s) => s.setProvider);
  const interval = useSettingsState((s) => s.samplingIntervalMs);
  const setSamplingInterval = useSettingsState((s) => s.setSamplingInterval);
  const disabled = useSettingsState((s) => s.disabledDetectors);
  const toggle = useSettingsState((s) => s.toggleDetector);

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%', maxWidth: 640 }}>
      <div style={{ marginBottom: 'var(--s-4)' }}>
        <SectionLabel>AI provider</SectionLabel>
        <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--s-2)' }}>
          Choose which engine explains leaks. The built-in heuristic engine is deterministic and offline. Add a Claude
          or NVIDIA key to unlock richer, code-aware explanations. Keys are stored locally, and only structured leak
          evidence (stacks, sizes, URLs) is sent — never page content.
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-1)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 3, width: 'fit-content' }}>
          {(['heuristic', 'claude', 'nvidia'] as ProviderKind[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                padding: '4px 14px',
                borderRadius: 4,
                fontSize: 'var(--fs-sm)',
                fontWeight: provider === p ? 600 : 400,
                color: provider === p ? '#fff' : 'var(--muted)',
                background: provider === p ? 'var(--primary)' : 'transparent',
                transition: 'background var(--t-fast) var(--ease)',
                textTransform: 'capitalize',
              }}
            >
              {p === 'nvidia' ? 'NVIDIA' : p}
            </button>
          ))}
        </div>
      </div>

      {PROVIDERS.map((meta) => (
        <KeyedProviderRow key={meta.kind} meta={meta} active={provider === meta.kind} />
      ))}

      <div style={{ margin: 'var(--s-4) 0' }}>
        <SectionLabel>Memory sampling interval</SectionLabel>
        <select value={interval} onChange={(e) => setSamplingInterval(Number(e.target.value))} style={{ background: 'var(--card)' }}>
          <option value={1000}>1 s</option>
          <option value={2000}>2 s (default)</option>
          <option value={5000}>5 s</option>
        </select>
      </div>

      <div>
        <SectionLabel>Detectors</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allDetectors.map((d) => (
            <label
              key={d.id}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--fs-sm)', padding: '4px 0', cursor: 'pointer' }}
            >
              <input type="checkbox" checked={!disabled.includes(d.id)} onChange={() => toggle(d.id)} />
              <span>{d.title}</span>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                needs {d.requires.join(' + ') || 'nothing'}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

type Status = { state: 'idle' | 'checking' } | { state: 'valid'; count: number } | { state: 'invalid'; error: string };

function KeyedProviderRow({ meta, active }: { meta: KeyedMeta; active: boolean }) {
  const key = useSettingsState((s) => (meta.kind === 'claude' ? s.claudeKey : s.nvidiaKey));
  const model = useSettingsState((s) => (meta.kind === 'claude' ? s.claudeModel : s.nvidiaModel));
  const setKey = useSettingsState((s) => s.setKey);
  const setModel = useSettingsState((s) => s.setModel);

  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [models, setModels] = useState<ModelInfo[]>([]);

  const check = async () => {
    setStatus({ state: 'checking' });
    setModels([]);
    const res = await validateProviderKey(meta.kind, key, model);
    if (res.ok) {
      setModels(res.models);
      setStatus({ state: 'valid', count: res.models.length });
      // if the saved model isn't in the returned list, pick the first
      if (!res.models.some((m) => m.id === model) && res.models[0]) {
        setModel(meta.kind, res.models[0].id);
      }
    } else {
      setStatus({ state: 'invalid', error: res.error });
    }
  };

  return (
    <div
      style={{
        marginBottom: 'var(--s-3)',
        padding: 'var(--s-3)',
        border: `1px solid ${active ? 'var(--primary-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        background: active ? 'var(--primary-dim)' : 'var(--card)',
        transition: 'border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{meta.name}</span>
        {active && <Badge tone="primary">active</Badge>}
        <span style={{ flex: 1 }} />
        <a
          href={meta.signup.url}
          target="_blank"
          rel="noreferrer"
          className="muted"
          style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}
        >
          get a key ↗ {meta.signup.label}
        </a>
      </div>
      <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 'var(--s-2)' }}>
        {meta.hint}
      </div>

      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
        <input
          type="password"
          placeholder={meta.keyPlaceholder}
          value={key}
          onChange={(e) => {
            setKey(meta.kind, e.target.value);
            setStatus({ state: 'idle' });
          }}
          style={{ flex: 1 }}
        />
        <Button onClick={() => void check()} disabled={!key.trim() || status.state === 'checking'}>
          {status.state === 'checking' ? 'Checking…' : 'Validate'}
        </Button>
      </div>

      <div style={{ minHeight: 20, marginTop: 6 }}>
        {status.state === 'valid' && <Badge tone="success">✓ Key valid · {status.count} models</Badge>}
        {status.state === 'invalid' && <Badge tone="danger">✕ {status.error}</Badge>}
      </div>

      {(models.length > 0 || model) && (
        <div style={{ marginTop: 'var(--s-2)' }}>
          <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 4 }}>
            Model
          </div>
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(meta.kind, e.target.value)}
              style={{ background: 'var(--bg)', width: '100%', maxWidth: 380 }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>
              {model} — validate the key to load the full list
            </span>
          )}
        </div>
      )}
    </div>
  );
}
