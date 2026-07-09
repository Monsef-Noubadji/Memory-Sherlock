import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionLabel } from '../components/primitives';
import { useAnalysisState, useRuntime, useSessionState } from '../runtime';
import { formatBytes } from '@/shared/leak';
import type { AggregateRow } from '@/core/heap/protocol';

const COLLECTION_NAMES = ['Map', 'Set', 'WeakMap', 'WeakSet', 'Array'];

export function Caches() {
  const rt = useRuntime();
  const snapshots = useSessionState((s) => s.snapshots);
  const result = useAnalysisState((s) => s.result);
  const [rows, setRows] = useState<AggregateRow[]>([]);
  const latest = snapshots[snapshots.length - 1];

  useEffect(() => {
    const client = rt.heap();
    if (!client || !latest) return;
    void Promise.all(
      COLLECTION_NAMES.map((name) =>
        client.request({ op: 'aggregate', snapshotId: latest.id, query: name, sort: 'retained', page: 0, pageSize: 5 }),
      ),
    ).then((results) => {
      const merged = new Map<string, AggregateRow>();
      for (const r of results) {
        for (const row of r.rows) {
          if (COLLECTION_NAMES.includes(row.name)) merged.set(row.name, row);
        }
      }
      setRows([...merged.values()].sort((a, b) => b.retained - a.retained));
    });
  }, [rt, latest]);

  const growing = (result?.candidates ?? []).filter((c) => c.classification === 'collection-growth');

  if (!latest) {
    return <EmptyState title="No snapshot" hint="Cache analysis reads collection sizes from the heap snapshot." />;
  }

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      {growing.length > 0 && (
        <>
          <SectionLabel>Growing collections (from diff)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
            {growing.map((c) => (
              <Card key={c.id}>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
                  {c.evidence.detail}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      <SectionLabel>Collections in {latest.label}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--s-2)' }}>
        {rows.map((r) => (
          <Card key={r.name}>
            <div className="mono" style={{ fontWeight: 600 }}>{r.name}</div>
            <div className="muted mono" style={{ fontSize: 'var(--fs-xs)', marginTop: 4 }}>
              {r.count.toLocaleString()} instances · {formatBytes(r.retained)} retained
            </div>
          </Card>
        ))}
        {rows.length === 0 && <span className="muted">No collection constructors found in this snapshot.</span>}
      </div>
    </div>
  );
}
