import { describe, it, expect, beforeEach } from 'vitest';
import { installAgent } from '../instrument';
import type { TelemetryEvent } from '@/shared/telemetry';

type Win = Window & typeof globalThis;

function install() {
  const events: TelemetryEvent[] = [];
  const uninstall = installAgent(window as Win, (e) => events.push(e));
  return { events, uninstall };
}

const flushMutations = () => new Promise((r) => setTimeout(r, 0));

describe('installAgent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).__memorySherlockAgent;
  });

  it('emits listener-added / listener-removed pairs with matching ids and stacks', () => {
    const { events, uninstall } = install();
    const el = document.createElement('button');
    document.body.appendChild(el);
    const handler = () => undefined;
    el.addEventListener('click', handler);
    el.removeEventListener('click', handler);
    uninstall();

    const added = events.find((e) => e.kind === 'listener-added');
    const removed = events.find((e) => e.kind === 'listener-removed');
    expect(added).toBeDefined();
    expect(removed).toBeDefined();
    expect(added!.kind === 'listener-added' && added!.id).toBe(
      removed!.kind === 'listener-removed' && removed!.id,
    );
    if (added!.kind === 'listener-added') {
      expect(added!.type).toBe('click');
      expect(added!.targetDesc).toContain('button');
      expect(added!.targetIsNode).toBe(true);
      expect(added!.stack.length).toBeGreaterThan(0);
    }
  });

  it('describes window listeners and marks them non-node', () => {
    const { events, uninstall } = install();
    window.addEventListener('resize', () => undefined);
    uninstall();
    const added = events.find((e) => e.kind === 'listener-added');
    expect(added && added.kind === 'listener-added' && added.targetDesc).toBe('window');
    expect(added && added.kind === 'listener-added' && added.targetIsNode).toBe(false);
  });

  it('tracks intervals and their clears', () => {
    const { events, uninstall } = install();
    const id = window.setInterval(() => undefined, 60_000);
    window.clearInterval(id);
    uninstall();
    const set = events.find((e) => e.kind === 'timer-set');
    const cleared = events.find((e) => e.kind === 'timer-cleared');
    expect(set && set.kind === 'timer-set' && set.timerKind).toBe('interval');
    expect(cleared).toBeDefined();
    expect((set as { id: number }).id).toBe((cleared as { id: number }).id);
  });

  it('marks a fired timeout as cleared (not a leak)', async () => {
    const { events, uninstall } = install();
    window.setTimeout(() => undefined, 0);
    await new Promise((r) => setTimeout(r, 5));
    uninstall();
    expect(events.some((e) => e.kind === 'timer-cleared')).toBe(true);
  });

  it('tracks MutationObserver create/observe/disconnect', () => {
    const { events, uninstall } = install();
    const mo = new MutationObserver(() => undefined);
    mo.observe(document.body, { childList: true });
    mo.disconnect();
    uninstall();
    const kinds = events.filter((e) => e.kind.startsWith('observer-')).map((e) => e.kind);
    expect(kinds).toEqual(['observer-created', 'observer-observe', 'observer-disconnect']);
  });

  it('emits target-removed when a listener target leaves the DOM', async () => {
    const { events, uninstall } = install();
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.addEventListener('click', () => undefined);
    el.remove();
    await flushMutations();
    uninstall();
    const removed = events.find((e) => e.kind === 'target-removed');
    expect(removed).toBeDefined();
    const added = events.find((e) => e.kind === 'listener-added');
    expect(removed!.kind === 'target-removed' && removed!.ids).toContain(
      (added as { id: number }).id,
    );
  });

  it('is idempotent — double install does not double-report', () => {
    const events: TelemetryEvent[] = [];
    const un1 = installAgent(window as Win, (e) => events.push(e));
    const un2 = installAgent(window as Win, (e) => events.push(e));
    window.setInterval(() => undefined, 60_000);
    un1();
    un2();
    expect(events.filter((e) => e.kind === 'timer-set')).toHaveLength(1);
  });
});
