import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { parseSnapshot } from '../parse';
import { shortestRetainerPath } from '../paths';

describe('shortestRetainerPath', () => {
  it('returns the node followed by retainers up to the root', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const app = b.node('App', { selfSize: 8 });
    const cache = b.node('Cache', { selfSize: 8 });
    const leaked = b.node('LeakedThing', { selfSize: 8 });
    b.edge(root, app, { name: 'app' });
    b.edge(app, cache, { name: 'cache' });
    b.edge(cache, leaked, { name: 'entry' });
    const g = parseSnapshot(b.build());
    const path = shortestRetainerPath(g, leaked);
    expect(path.map((s) => s.nodeName)).toEqual(['LeakedThing', 'Cache', 'App', '']);
    expect(path[1].edgeName).toBe('entry'); // Cache --entry--> LeakedThing
    expect(path[2].edgeName).toBe('cache');
    void root;
  });

  it('prefers the shortest path and skips weak edges', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const long1 = b.node('Long1', { selfSize: 8 });
    const long2 = b.node('Long2', { selfSize: 8 });
    const weakDirect = b.node('WeakMap', { selfSize: 8 });
    const target = b.node('Target', { selfSize: 8 });
    b.edge(root, long1);
    b.edge(long1, long2);
    b.edge(long2, target, { name: 'strongLong' });
    b.edge(root, weakDirect);
    b.edge(weakDirect, target, { type: 'weak', name: 'weakShort' });
    const g = parseSnapshot(b.build());
    const path = shortestRetainerPath(g, target);
    // must not use the weak 2-hop path; must take the strong 3-hop path
    expect(path.map((s) => s.nodeName)).toEqual(['Target', 'Long2', 'Long1', '']);
  });

  it('returns [] when only weak paths reach the node', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const holder = b.node('Holder', { selfSize: 8 });
    const ghost = b.node('Ghost', { selfSize: 8 });
    b.edge(root, holder);
    b.edge(holder, ghost, { type: 'weak' });
    const g = parseSnapshot(b.build());
    expect(shortestRetainerPath(g, ghost)).toEqual([]);
  });
});
