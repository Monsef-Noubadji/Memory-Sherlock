import { HeapChart } from '../components/HeapChart';
import { SectionLabel } from '../components/primitives';
import { useSessionState } from '../runtime';
import { formatBytes } from '@/shared/leak';

export function TimelineScreen() {
  const snapshots = useSessionState((s) => s.snapshots);
  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}>
        <SectionLabel>Heap timeline</SectionLabel>
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          drag to zoom · double-click to reset · dashed lines mark snapshots
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <HeapChart height={420} />
      </div>
      {snapshots.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', paddingTop: 'var(--s-2)' }}>
          {snapshots.map((s) => (
            <span key={s.id} className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>
              ◆ {s.label} — {new Date(s.time).toLocaleTimeString()} · {formatBytes(s.totalSize)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
