import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge, EmptyState, SectionLabel } from '../components/primitives';
import { StackTrace } from '../components/RetainerChain';
import { useSessionState } from '../runtime';
import { useTelemetry } from '../lib/useTelemetry';

export function EventListeners() {
  const telemetry = useTelemetry();
  const agentOn = useSessionState((s) => s.capabilities.agent);
  const [expanded, setExpanded] = useState<number | null>(null);
  const listeners = useMemo(
    () =>
      [...telemetry.liveListeners()].sort(
        (a, b) => Number(b.targetRemoved) - Number(a.targetRemoved) || a.addedAt - b.addedAt,
      ),
    [telemetry],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: listeners.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (expanded === listeners[i]?.id ? 200 : 30),
    overscan: 10,
  });

  if (!agentOn && listeners.length === 0) {
    return (
      <EmptyState
        title="Page agent not active"
        hint="Listener tracking needs the injected page agent. Reload the inspected page with the extension enabled; if the site's CSP blocks injection, this view stays unavailable rather than guessing."
      />
    );
  }
  if (listeners.length === 0) {
    return <EmptyState title="No live listeners tracked yet" hint="Interact with the page — every addEventListener is recorded with its creation stack." />;
  }

  const dangerous = listeners.filter((l) => l.targetRemoved).length;

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', marginBottom: 'var(--s-2)' }}>
        <SectionLabel>{listeners.length} live listeners</SectionLabel>
        {dangerous > 0 && <Badge tone="danger">{dangerous} on removed targets</Badge>}
      </div>
      <div
        style={{
          display: 'flex',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--muted)',
          fontWeight: 600,
        }}
      >
        <span style={{ width: 90 }}>Event</span>
        <span style={{ flex: 1 }}>Target</span>
        <span style={{ width: 200 }}>Owner</span>
        <span style={{ width: 110 }}>Cleanup</span>
      </div>
      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const l = listeners[v.index];
            const owner = l.stack[0]?.replace(/^at\s+/, '') ?? '—';
            const isOpen = expanded === l.id;
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${v.start}px)` }}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : l.id)}
                  className="mono"
                  style={{
                    display: 'flex',
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 'var(--fs-xs)',
                    textAlign: 'left',
                    alignItems: 'center',
                    background: l.targetRemoved ? 'var(--danger-dim)' : 'transparent',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <span style={{ width: 90, color: 'var(--primary)' }}>{l.type}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.targetDesc}</span>
                  <span className="muted" style={{ width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {owner}
                  </span>
                  <span style={{ width: 110 }}>
                    {l.targetRemoved ? (
                      <Badge tone="danger">missing</Badge>
                    ) : (
                      <Badge tone="neutral">live</Badge>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: '4px 8px 8px' }}>
                    <StackTrace stack={l.stack} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
