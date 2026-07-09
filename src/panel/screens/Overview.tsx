import { useMemo } from 'react';
import { Card, SectionLabel, Badge } from '../components/primitives';
import { useAnalysisState, useSessionState, useUiState } from '../runtime';
import { useTelemetry } from '../lib/useTelemetry';
import { leakScore, scoreTone } from '../lib/leakScore';
import { formatBytes } from '@/shared/leak';
import type { Route } from '../stores/ui';

interface Stat {
  label: string;
  value: string;
  sub?: string;
  route: Route;
  tone?: 'success' | 'warning' | 'danger';
}

export function Overview() {
  const navigate = useUiState((s) => s.navigate);
  const snapshots = useSessionState((s) => s.snapshots);
  const events = useSessionState((s) => s.events);
  const result = useAnalysisState((s) => s.result);
  const telemetry = useTelemetry();

  const stats = useMemo<Stat[]>(() => {
    const latest = snapshots[snapshots.length - 1];
    const series = telemetry.memorySeries();
    const lastSample = series[series.length - 1];
    const minuteAgo = series.filter((s) => s.t >= Date.now() - 60_000);
    const growth = minuteAgo.length >= 2 ? minuteAgo[minuteAgo.length - 1].used - minuteAgo[0].used : 0;
    const candidates = result?.candidates ?? [];
    const byClass = (c: string) => candidates.filter((x) => x.classification === c);
    const score = leakScore(candidates);

    return [
      {
        label: 'Heap Size',
        value: lastSample ? formatBytes(lastSample.used) : latest ? formatBytes(latest.totalSize) : '—',
        sub: lastSample ? 'live (agent)' : latest ? 'from snapshot' : 'attach to measure',
        route: 'timeline',
      },
      {
        label: 'Retained Size',
        value: latest ? formatBytes(latest.totalSize) : '—',
        sub: latest ? latest.label : 'take a snapshot',
        route: 'snapshots',
      },
      {
        label: 'Objects',
        value: latest ? latest.nodeCount.toLocaleString() : '—',
        route: 'snapshots',
      },
      {
        label: 'Detached DOM',
        value: String(byClass('detached-dom').reduce((n, c) => n + c.count, 0) || (result ? 0 : '—')),
        route: 'detached',
        tone: byClass('detached-dom').length > 0 ? 'danger' : undefined,
      },
      {
        label: 'Growing Collections',
        value: String(byClass('collection-growth').length || (result ? 0 : '—')),
        route: 'caches',
        tone: byClass('collection-growth').length > 0 ? 'warning' : undefined,
      },
      {
        label: 'Event Listeners',
        value: String(telemetry.liveListeners().length),
        sub: `${telemetry.liveListeners().filter((l) => l.targetRemoved).length} on removed targets`,
        route: 'listeners',
        tone: telemetry.liveListeners().some((l) => l.targetRemoved) ? 'danger' : undefined,
      },
      {
        label: 'Timers',
        value: String(telemetry.liveTimers().length),
        route: 'listeners',
      },
      {
        label: 'Observers',
        value: String(telemetry.liveObservers().length),
        route: 'observers',
      },
      {
        label: 'React Fibers',
        value: byClass('react-fiber')[0] ? String(byClass('react-fiber')[0].count) : '—',
        route: 'react',
      },
      {
        label: 'Memory Growth',
        value: growth === 0 ? '—' : `${growth > 0 ? '+' : ''}${formatBytes(Math.abs(growth))}/min`,
        route: 'timeline',
        tone: growth > 1024 * 1024 ? 'warning' : undefined,
      },
      {
        label: 'Leak Score',
        value: result ? String(score) : '—',
        sub: result ? { success: 'healthy', warning: 'needs attention', danger: 'leaking' }[scoreTone(score)] : 'run Analyze',
        route: 'leaks',
        tone: result ? scoreTone(score) : undefined,
      },
    ];
  }, [snapshots, telemetry, result, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
        <SectionLabel>Application memory health</SectionLabel>
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          {events.length.toLocaleString()} telemetry events · {snapshots.length} snapshot(s)
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 'var(--s-2)',
        }}
      >
        {stats.map((s) => (
          <Card key={s.label} onClick={() => navigate(s.route)}>
            <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 4 }}>
              {s.label}
            </div>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-xl)',
                fontWeight: 600,
                color: s.tone ? `var(--${s.tone})` : 'var(--text)',
              }}
            >
              {s.value}
            </div>
            {s.sub && (
              <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 2 }}>
                {s.sub}
              </div>
            )}
          </Card>
        ))}
      </div>
      {result && result.unavailable.length > 0 && (
        <div style={{ marginTop: 'var(--s-3)', display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
            Unavailable detectors:
          </span>
          {result.unavailable.map((u) => (
            <Badge key={u.id} tone="neutral">
              {u.title} — needs {u.missing.join(', ') || 'repair'}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
