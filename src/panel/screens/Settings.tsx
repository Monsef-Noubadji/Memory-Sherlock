import { Badge, SectionLabel } from '../components/primitives';
import { useSettingsState } from '../runtime';
import { allDetectors } from '@/core/detectors';

export function Settings() {
  const apiKey = useSettingsState((s) => s.apiKey);
  const setApiKey = useSettingsState((s) => s.setApiKey);
  const interval = useSettingsState((s) => s.samplingIntervalMs);
  const setInterval_ = useSettingsState((s) => s.setSamplingInterval);
  const disabled = useSettingsState((s) => s.disabledDetectors);
  const toggle = useSettingsState((s) => s.toggleDetector);

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%', maxWidth: 560 }}>
      <div style={{ marginBottom: 'var(--s-4)' }}>
        <SectionLabel>AI explanations</SectionLabel>
        <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--s-2)' }}>
          Without a key, Memory Sherlock uses its built-in heuristic engine — deterministic, offline. Add a Claude
          API key for richer, code-aware explanations and patches. The key is stored locally and only structured leak
          evidence (stacks, sizes, URLs) is sent — never page content.
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <input
            type="password"
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ flex: 1 }}
          />
          <Badge tone={apiKey ? 'primary' : 'neutral'}>{apiKey ? 'Claude' : 'Heuristic'}</Badge>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--s-4)' }}>
        <SectionLabel>Memory sampling interval</SectionLabel>
        <select value={interval} onChange={(e) => setInterval_(Number(e.target.value))} style={{ background: 'var(--card)' }}>
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-2)',
                fontSize: 'var(--fs-sm)',
                padding: '4px 0',
                cursor: 'pointer',
              }}
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
