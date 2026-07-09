import { Badge, Button } from './primitives';
import { Icon } from './Icon';
import { useAnalysisState, useRuntime, useSessionState, useUiState } from '../runtime';
import type { SessionState } from '@/shared/messages';

const STATE_TONE: Record<SessionState, 'neutral' | 'primary' | 'success' | 'warning' | 'danger'> = {
  idle: 'neutral',
  attaching: 'warning',
  attached: 'success',
  capturing: 'primary',
  detached: 'danger',
};

export function StatusBar() {
  const rt = useRuntime();
  const sessionState = useSessionState((s) => s.sessionState);
  const caps = useSessionState((s) => s.capabilities);
  const errors = useSessionState((s) => s.errors);
  const dismissError = useSessionState((s) => s.dismissError);
  const running = useAnalysisState((s) => s.running);
  const setPaletteOpen = useUiState((s) => s.setPaletteOpen);

  return (
    <div
      style={{
        height: 42,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-2)',
        padding: '0 var(--s-3)',
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 'var(--fs-md)' }}>
        Memory <span style={{ color: 'var(--primary)' }}>Sherlock</span>
      </span>
      <Badge tone={STATE_TONE[sessionState]}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'currentColor',
            display: 'inline-block',
          }}
        />
        {sessionState}
      </Badge>

      <span style={{ flex: 1 }} />

      {errors.length > 0 && (
        <button
          onClick={() => dismissError(0)}
          title={`${errors[0]} (click to dismiss)`}
          style={{
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 'var(--fs-xs)',
            color: 'var(--danger)',
            padding: '2px 8px',
            borderRadius: 'var(--radius)',
            background: 'var(--danger-dim)',
          }}
        >
          {errors[0]} x
        </button>
      )}

      <Badge tone={caps.agent ? 'success' : 'neutral'}>agent {caps.agent ? 'on' : 'off'}</Badge>
      <Badge tone={caps.debugger ? 'success' : 'neutral'}>debugger {caps.debugger ? 'on' : 'off'}</Badge>

      <Button
        kind="primary"
        onClick={() => void rt.analysis.getState().runAnalysis()}
        disabled={running}
        title="Run all leak detectors"
      >
        <Icon name="search" size={12} />
        {running ? 'Analyzing...' : 'Analyze'}
      </Button>
      <Button kind="ghost" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">
        Ctrl+K
      </Button>
    </div>
  );
}
