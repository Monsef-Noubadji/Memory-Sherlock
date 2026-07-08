import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { parseSnapshot } from '../parse';
import { diffSnapshots } from '../diff';

function build(entries: Array<{ name: string; id: number; size?: number }>) {
  const b = new SnapshotBuilder();
  const root = b.node('', { type: 'synthetic', selfSize: 0 });
  for (const e of entries) {
    const n = b.node(e.name, { selfSize: e.size ?? 16, id: e.id });
    b.edge(root, n);
  }
  return parseSnapshot(b.build());
}

describe('diffSnapshots', () => {
  it('reports added and removed instances by constructor using node ids', () => {
    const before = build([
      { name: 'CacheEntry', id: 11 },
      { name: 'CacheEntry', id: 13 },
      { name: 'Session', id: 15 },
    ]);
    const after = build([
      { name: 'CacheEntry', id: 11 },
      { name: 'CacheEntry', id: 13 },
      { name: 'CacheEntry', id: 21, size: 64 },
      { name: 'CacheEntry', id: 23, size: 64 },
    ]);
    const rows = diffSnapshots(before, after);
    const cache = rows.find((r) => r.name === 'CacheEntry')!;
    expect(cache.addedCount).toBe(2);
    expect(cache.removedCount).toBe(0);
    expect(cache.countDelta).toBe(2);
    expect(cache.sizeDelta).toBe(128);
    const session = rows.find((r) => r.name === 'Session')!;
    expect(session.removedCount).toBe(1);
    expect(session.countDelta).toBe(-1);
  });

  it('omits constructors with no change', () => {
    const before = build([{ name: 'Stable', id: 11 }]);
    const after = build([{ name: 'Stable', id: 11 }]);
    expect(diffSnapshots(before, after)).toEqual([]);
  });
});
