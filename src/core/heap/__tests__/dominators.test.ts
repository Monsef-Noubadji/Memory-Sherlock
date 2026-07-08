import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { parseSnapshot } from '../parse';
import { computeRetainedSizes } from '../dominators';

describe('computeRetainedSizes', () => {
  it('assigns a leaf its self size and a sole owner the subtree sum', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const owner = b.node('Owner', { selfSize: 10 });
    const leaf = b.node('Leaf', { selfSize: 100 });
    b.edge(root, owner);
    b.edge(owner, leaf);
    const g = parseSnapshot(b.build());
    const retained = computeRetainedSizes(g);
    expect(retained[leaf]).toBe(100);
    expect(retained[owner]).toBe(110);
    expect(retained[root]).toBe(110);
  });

  it('accrues a shared child to the dominator, not to either parent (diamond)', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const top = b.node('Top', { selfSize: 8 });
    const a = b.node('A', { selfSize: 16 });
    const c = b.node('C', { selfSize: 16 });
    const shared = b.node('Shared', { selfSize: 1000 });
    b.edge(root, top);
    b.edge(top, a);
    b.edge(top, c);
    b.edge(a, shared);
    b.edge(c, shared);
    const g = parseSnapshot(b.build());
    const retained = computeRetainedSizes(g);
    // neither A nor C dominates Shared — Top does
    expect(retained[a]).toBe(16);
    expect(retained[c]).toBe(16);
    expect(retained[top]).toBe(8 + 16 + 16 + 1000);
  });

  it('does not treat weak edges as owning', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const strongOwner = b.node('StrongOwner', { selfSize: 8 });
    const weakHolder = b.node('WeakHolder', { selfSize: 8 });
    const value = b.node('Value', { selfSize: 500 });
    b.edge(root, strongOwner);
    b.edge(root, weakHolder);
    b.edge(strongOwner, value);
    b.edge(weakHolder, value, { type: 'weak' });
    const g = parseSnapshot(b.build());
    const retained = computeRetainedSizes(g);
    expect(retained[strongOwner]).toBe(508);
    expect(retained[weakHolder]).toBe(8);
  });

  it('gives weakly-only-reachable nodes their self size without crashing', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const holder = b.node('Holder', { selfSize: 8 });
    const ghost = b.node('Ghost', { selfSize: 64 });
    b.edge(root, holder);
    b.edge(holder, ghost, { type: 'weak' });
    const g = parseSnapshot(b.build());
    const retained = computeRetainedSizes(g);
    expect(retained[ghost]).toBe(64);
    expect(retained[holder]).toBe(8);
  });
});
