import { useMemo, useState } from 'react';
import { Badge, EmptyState, SectionLabel } from '../components/primitives';
import { StackTrace } from '../components/RetainerChain';
import { useSessionState } from '../runtime';
import { useTelemetry } from '../lib/useTelemetry';

export function Observers() {
  const telemetry = useTelemetry();
  const agentOn = useSessionState((s) => s.capabilities.agent);
  const [expanded, setExpanded] = useState<number | null>(null);
  const observers = useMemo(() => telemetry.liveObservers(), [telemetry]);

  if (!agentOn && observers.length === 0) {
    return <EmptyState title="Page agent not active" hint="Observer tracking needs the injected page agent on the inspected page." />;
  }
  if (observers.length === 0) {
    return (
      <EmptyState
        title="No live observers"
        hint="ResizeObserver, MutationObserver, IntersectionObserver, and PerformanceObserver instances appear here while they observe."
      />
    );
  }

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      <SectionLabel>{observers.length} observing without disconnect</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {observers.map((o) => {
          const age = Math.round((Date.now() - o.createdAt) / 1000);
          return (
            <div key={o.id}>
              <button
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                className="mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-2)',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 'var(--fs-xs)',
                  borderRadius: 'var(--radius)',
                  background: age > 30 ? 'var(--warning-dim)' : 'transparent',
                }}
              >
                <span style={{ color: 'var(--primary)', width: 160 }}>{o.observerType}</span>
                <span className="muted">observing ×{o.observeCount}</span>
                <span style={{ flex: 1 }} />
                <Badge tone={age > 30 ? 'warning' : 'neutral'}>{age}s alive</Badge>
              </button>
              {expanded === o.id && (
                <div style={{ padding: '4px 8px' }}>
                  <StackTrace stack={o.stack} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
