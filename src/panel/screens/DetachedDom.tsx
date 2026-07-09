import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, SectionLabel } from '../components/primitives';
import { RetainerChain } from '../components/RetainerChain';
import { useRuntime, useSessionState } from '../runtime';
import { formatBytes, type RetainerStep } from '@/shared/leak';
import type { DetachedSubtreeRow } from '@/core/heap/protocol';

export function DetachedDom() {
  const rt = useRuntime();
  const snapshots = useSessionState((s) => s.snapshots);
  const [subtrees, setSubtrees] = useState<DetachedSubtreeRow[] | null>(null);
  const [paths, setPaths] = useState<Record<number, RetainerStep[]>>({});

  const latest = snapshots[snapshots.length - 1];

  useEffect(() => {
    const client = rt.heap();
    if (!client || !latest) return;
    void client.request({ op: 'detached', snapshotId: latest.id }).then((r) => setSubtrees(r.subtrees));
  }, [rt, latest]);

  const loadPath = async (nodeId: number) => {
    const client = rt.heap();
    if (!client || !latest) return;
    const r = await client.request({ op: 'retainers', snapshotId: latest.id, nodeId });
    setPaths((p) => ({ ...p, [nodeId]: r.path }));
  };

  if (!latest) {
    return (
      <EmptyState
        title="No snapshot to inspect"
        hint="Detached DOM analysis reads the heap snapshot. Import a .heapsnapshot on the Snapshots screen first."
      />
    );
  }
  if (subtrees === null) return <EmptyState title="Scanning snapshot…" />;
  if (subtrees.length === 0) {
    return <EmptyState title="No detached DOM" hint="Every DOM node in the latest snapshot is still attached to the document. That's what healthy looks like." />;
  }

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      <SectionLabel>
        {subtrees.length} detached subtree{subtrees.length === 1 ? '' : 's'} in {latest.label}
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {subtrees.map((s) => (
          <Card key={s.representative.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontWeight: 600 }}>
                {s.representative.name}
              </span>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                {s.count} node{s.count === 1 ? '' : 's'} · retains {formatBytes(s.retainedBytes)}
              </span>
              <span style={{ flex: 1 }} />
              {!paths[s.representative.id] && (
                <Button onClick={() => void loadPath(s.representative.id)}>Why is it alive?</Button>
              )}
            </div>
            {s.childNames.length > 0 && (
              <div className="mono muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 4 }}>
                contains: {s.childNames.join(', ')}
              </div>
            )}
            {paths[s.representative.id] && (
              <div className="fade-in" style={{ marginTop: 'var(--s-2)' }}>
                <RetainerChain path={paths[s.representative.id]} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
