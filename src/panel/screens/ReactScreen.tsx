import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, SectionLabel } from '../components/primitives';
import { useAnalysisState, useRuntime, useSessionState } from '../runtime';
import { formatBytes } from '@/shared/leak';
import type { AggregateRow } from '@/core/heap/protocol';

export function ReactScreen() {
  const rt = useRuntime();
  const snapshots = useSessionState((s) => s.snapshots);
  const result = useAnalysisState((s) => s.result);
  const [fiberRow, setFiberRow] = useState<AggregateRow | null>(null);
  const latest = snapshots[snapshots.length - 1];

  useEffect(() => {
    const client = rt.heap();
    if (!client || !latest) return;
    void client
      .request({ op: 'aggregate', snapshotId: latest.id, query: 'FiberNode', sort: 'count', page: 0, pageSize: 1 })
      .then((r) => setFiberRow(r.rows[0] ?? null));
  }, [rt, latest]);

  const fiberCandidate = (result?.candidates ?? []).find((c) => c.classification === 'react-fiber');

  if (!latest) {
    return <EmptyState title="No snapshot" hint="React fiber analysis reads the heap snapshot. Capture one on a React page." />;
  }
  if (!fiberRow) {
    return (
      <EmptyState
        title="No React fibers found"
        hint="The latest snapshot contains no FiberNode instances — either this page doesn't use React, or it's a production build with different internals."
      />
    );
  }

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
        <SectionLabel>React inspector</SectionLabel>
        <Badge tone="warning">preview</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
        <Card>
          <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Fiber nodes</div>
          <div className="mono" style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>{fiberRow.count.toLocaleString()}</div>
        </Card>
        <Card>
          <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Fiber memory</div>
          <div className="mono" style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>{formatBytes(fiberRow.retained)}</div>
        </Card>
      </div>
      {fiberCandidate ? (
        <Card>
          <div style={{ fontWeight: 600, color: 'var(--warning)' }}>{fiberCandidate.title}</div>
          <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>{fiberCandidate.evidence.detail}</div>
        </Card>
      ) : (
        <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Fiber count is stable across snapshots. Deep fiber-tree attribution (which components are retained, by what) ships in a future release.
        </div>
      )}
    </div>
  );
}
