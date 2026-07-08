import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { parseSnapshot } from '../parse';
import { computeRetainedSizes } from '../dominators';
import { aggregateByConstructor } from '../aggregate';

describe('aggregateByConstructor', () => {
  it('groups objects by constructor name with count/shallow/retained', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const m1 = b.node('Map', { selfSize: 32 });
    const m2 = b.node('Map', { selfSize: 48 });
    const s = b.node('LeakStore', { selfSize: 16 });
    const str = b.node('hello', { type: 'string', selfSize: 24 });
    b.edge(root, m1);
    b.edge(root, m2);
    b.edge(root, s);
    b.edge(s, str);
    const g = parseSnapshot(b.build());
    g.retained = computeRetainedSizes(g);

    const rows = aggregateByConstructor(g);
    const map = rows.find((r) => r.name === 'Map');
    expect(map).toBeDefined();
    expect(map!.count).toBe(2);
    expect(map!.shallow).toBe(80);
    expect(map!.sampleNodes).toHaveLength(2);
    const strings = rows.find((r) => r.name === '(string)');
    expect(strings!.count).toBe(1);
    const store = rows.find((r) => r.name === 'LeakStore');
    expect(store!.retained).toBe(16 + 24);
  });
});
