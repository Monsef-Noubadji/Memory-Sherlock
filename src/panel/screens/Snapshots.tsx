import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, EmptyState, SectionLabel } from '../components/primitives';
import { RetainerChain } from '../components/RetainerChain';
import { useRuntime, useSessionState } from '../runtime';
import { formatBytes } from '@/shared/leak';
import type { AggregateRow, NodeRow, RetainersResult, SnapshotDiffRow } from '@/core/heap/protocol';

type Sort = 'retained' | 'shallow' | 'count';

export function Snapshots() {
  const rt = useRuntime();
  const snapshots = useSessionState((s) => s.snapshots);
  const loadingSnapshot = useSessionState((s) => s.loadingSnapshot);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [diffMode, setDiffMode] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('retained');
  const [rows, setRows] = useState<AggregateRow[]>([]);
  const [diffRows, setDiffRows] = useState<SnapshotDiffRow[]>([]);
  const [drill, setDrill] = useState<{ constructorName: string; nodes: NodeRow[] } | null>(null);
  const [retainers, setRetainers] = useState<RetainersResult | null>(null);

  const current = selectedId ?? snapshots[snapshots.length - 1]?.id ?? null;
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2].id : null;

  const chooseSnapshotFile = () => importInputRef.current?.click();

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      await rt.session.getState().importSnapshot(file.name, text);
    } catch (err) {
      await rt.session.getState().onMessage({
        type: 'error',
        message: `import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const fileInput = (
    <input
      ref={importInputRef}
      type="file"
      accept=".heapsnapshot,.json,application/json"
      onChange={(event) => void handleImportFile(event)}
      style={{ display: 'none' }}
    />
  );

  useEffect(() => {
    const client = rt.heap();
    if (!client || current === null) return;
    if (diffMode && prev !== null) {
      void client
        .request({ op: 'diff', beforeId: prev, afterId: current, page: 0, pageSize: 2000 })
        .then((r) => setDiffRows(r.rows));
    } else {
      void client
        .request({ op: 'aggregate', snapshotId: current, query: query || undefined, sort, page: 0, pageSize: 2000 })
        .then((r) => setRows(r.rows));
    }
  }, [rt, current, query, sort, diffMode, prev]);

  const openDrill = async (constructorName: string) => {
    const client = rt.heap();
    if (!client || current === null) return;
    const res = await client.request({ op: 'nodes', snapshotId: current, constructorName, page: 0, pageSize: 50 });
    setDrill({ constructorName, nodes: res.rows });
    setRetainers(null);
  };

  const openRetainers = async (nodeId: number) => {
    const client = rt.heap();
    if (!client || current === null) return;
    setRetainers(await client.request({ op: 'retainers', snapshotId: current, nodeId }));
  };

  if (snapshots.length === 0) {
    return (
      <>
        {fileInput}
        <EmptyState
          title="No heap snapshots yet"
          hint="Export a .heapsnapshot from Chrome DevTools Memory, then import it here to inspect constructors, retained sizes, and retainer paths."
          action={
            <Button kind="primary" onClick={chooseSnapshotFile} disabled={loadingSnapshot}>
              {loadingSnapshot ? 'Importing...' : 'Import snapshot'}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {fileInput}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', marginBottom: 'var(--s-2)', flexWrap: 'wrap' }}>
          <select
            value={current ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            style={{ background: 'var(--card)' }}
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {formatBytes(s.totalSize)} / {s.nodeCount.toLocaleString()} objects
              </option>
            ))}
          </select>
          <Button kind={diffMode ? 'primary' : 'default'} onClick={() => setDiffMode((d) => !d)} disabled={prev === null} title={prev === null ? 'Need two snapshots' : 'Compare with previous snapshot'}>
            Diff mode
          </Button>
          {!diffMode && (
            <>
              <input placeholder="Filter constructors…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 180 }} />
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ background: 'var(--card)' }}>
                <option value="retained">Sort: retained</option>
                <option value="shallow">Sort: shallow</option>
                <option value="count">Sort: count</option>
              </select>
            </>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={chooseSnapshotFile} disabled={loadingSnapshot}>
            {loadingSnapshot ? 'Importing...' : 'Import'}
          </Button>
        </div>

        {diffMode ? <DiffTable rows={diffRows} /> : <AggregateTable rows={rows} onSelect={openDrill} />}
      </div>

      {drill && (
        <div
          style={{
            width: 340,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            background: 'var(--panel)',
            padding: 'var(--s-3)',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>{drill.constructorName}</SectionLabel>
            <Button kind="ghost" onClick={() => setDrill(null)}>
              ✕
            </Button>
          </div>
          {drill.nodes.map((n) => (
            <button
              key={n.id}
              onClick={() => void openRetainers(n.id)}
              className="mono"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                padding: '4px 8px',
                fontSize: 'var(--fs-xs)',
                borderRadius: 'var(--radius)',
                color: 'var(--muted)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>@{n.id}</span>
              <span>{formatBytes(n.retained)}</span>
            </button>
          ))}
          {retainers && (
            <div style={{ marginTop: 'var(--s-3)' }}>
              <SectionLabel>Retainer path</SectionLabel>
              <RetainerChain path={retainers.path} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeaderRow({ cols }: { cols: Array<[string, number | string]> }) {
  return (
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
      {cols.map(([label, width]) => (
        <span key={label} style={{ width, flexShrink: 0, ...(width === 'auto' ? { flex: 1 } : {}) }}>
          {label}
        </span>
      ))}
    </div>
  );
}

function AggregateTable({ rows, onSelect }: { rows: AggregateRow[]; onSelect: (name: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 20,
  });
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--card)' }}>
      <HeaderRow cols={[['Constructor', 'auto'], ['Count', 80], ['Shallow', 90], ['Retained', 90]]} />
      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const r = rows[v.index];
            return (
              <button
                key={v.key}
                onClick={() => onSelect(r.name)}
                className="mono"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${v.start}px)`,
                  display: 'flex',
                  padding: '4px 8px',
                  fontSize: 'var(--fs-xs)',
                  textAlign: 'left',
                  color: 'var(--text)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ width: 80, flexShrink: 0 }} className="muted">
                  {r.count.toLocaleString()}
                </span>
                <span style={{ width: 90, flexShrink: 0 }} className="muted">
                  {formatBytes(r.shallow)}
                </span>
                <span style={{ width: 90, flexShrink: 0 }}>{formatBytes(r.retained)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DiffTable({ rows }: { rows: SnapshotDiffRow[] }) {
  const sorted = useMemo(() => rows, [rows]);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--card)' }}>
      <HeaderRow cols={[['Constructor', 'auto'], ['+ New', 70], ['− Freed', 70], ['Δ Count', 70], ['Δ Size', 90]]} />
      {sorted.map((r) => (
        <div key={r.name} className="mono" style={{ display: 'flex', padding: '4px 8px', fontSize: 'var(--fs-xs)' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ width: 70, flexShrink: 0, color: 'var(--success)' }}>+{r.addedCount}</span>
          <span style={{ width: 70, flexShrink: 0, color: 'var(--muted)' }}>−{r.removedCount}</span>
          <span style={{ width: 70, flexShrink: 0, color: r.countDelta > 0 ? 'var(--warning)' : 'var(--muted)' }}>
            {r.countDelta > 0 ? '+' : ''}
            {r.countDelta}
          </span>
          <span style={{ width: 90, flexShrink: 0, color: r.sizeDelta > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {r.sizeDelta > 0 ? '+' : ''}
            {formatBytes(Math.abs(r.sizeDelta))}
          </span>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="muted" style={{ padding: 'var(--s-3)', fontSize: 'var(--fs-sm)' }}>
          No differences between the two snapshots.
        </div>
      )}
    </div>
  );
}
