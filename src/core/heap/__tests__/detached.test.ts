import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from './fixture';
import { parseSnapshot } from '../parse';
import { computeRetainedSizes } from '../dominators';
import { findDetachedDom } from '../detached';

describe('findDetachedDom', () => {
  it('groups a detached subtree under its top node and reports retained size', () => {
    const b = new SnapshotBuilder();
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const closure = b.node('savedRef', { type: 'closure', selfSize: 8 });
    const dialog = b.node('Detached HTMLDivElement', { type: 'native', selfSize: 100, detachedness: 2 });
    const child = b.node('Detached HTMLSpanElement', { type: 'native', selfSize: 50, detachedness: 2 });
    const attached = b.node('HTMLBodyElement', { type: 'native', selfSize: 40, detachedness: 1 });
    b.edge(root, closure);
    b.edge(root, attached);
    b.edge(closure, dialog, { name: 'node' });
    b.edge(dialog, child, { type: 'element', name: 0 });
    const g = parseSnapshot(b.build());
    g.retained = computeRetainedSizes(g);

    const subtrees = findDetachedDom(g);
    expect(subtrees).toHaveLength(1);
    expect(subtrees[0].representative).toBe(dialog);
    expect(subtrees[0].nodes.sort()).toEqual([dialog, child].sort());
    expect(subtrees[0].retainedBytes).toBe(150);
    void attached;
  });

  it('detects Detached-prefixed native nodes when detachedness field is absent', () => {
    const b = new SnapshotBuilder({ detachedness: false });
    const root = b.node('', { type: 'synthetic', selfSize: 0 });
    const holder = b.node('Holder', { selfSize: 8 });
    const div = b.node('Detached HTMLDivElement', { type: 'native', selfSize: 100 });
    b.edge(root, holder);
    b.edge(holder, div);
    const g = parseSnapshot(b.build());
    g.retained = computeRetainedSizes(g);
    const subtrees = findDetachedDom(g);
    expect(subtrees).toHaveLength(1);
    expect(subtrees[0].representative).toBe(div);
  });
});
