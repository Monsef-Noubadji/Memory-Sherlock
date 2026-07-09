import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { AiInspector } from './components/AiInspector';
import { CommandPalette } from './components/CommandPalette';
import { HeapChart } from './components/HeapChart';
import { ResizablePanel } from './components/SplitPane';
import { useUiState } from './runtime';
import { Overview } from './screens/Overview';
import { Snapshots } from './screens/Snapshots';
import { LeakCandidates } from './screens/LeakCandidates';
import { DetachedDom } from './screens/DetachedDom';
import { ReactScreen } from './screens/ReactScreen';
import { EventListeners } from './screens/EventListeners';
import { Observers } from './screens/Observers';
import { Caches } from './screens/Caches';
import { TimelineScreen } from './screens/TimelineScreen';
import { AiInsights } from './screens/AiInsights';
import { Settings } from './screens/Settings';
import type { Route } from './stores/ui';
import type { ComponentType } from 'react';

const SCREENS: Record<Route, ComponentType> = {
  overview: Overview,
  snapshots: Snapshots,
  leaks: LeakCandidates,
  detached: DetachedDom,
  react: ReactScreen,
  listeners: EventListeners,
  observers: Observers,
  caches: Caches,
  timeline: TimelineScreen,
  insights: AiInsights,
  settings: Settings,
};

export function AppShell() {
  const route = useUiState((s) => s.route);
  const Screen = SCREENS[route];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <StatusBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Screen />
        </main>
        <ResizablePanel id="inspector" side="right" defaultSize={300} min={220} max={520}>
          <AiInspector />
        </ResizablePanel>
      </div>
      {route !== 'timeline' && (
        <ResizablePanel id="timeline" side="bottom" defaultSize={120} min={72} max={260}>
          <div style={{ height: '100%', borderTop: '1px solid var(--border)', background: 'var(--panel)' }}>
            <HeapChart height={112} />
          </div>
        </ResizablePanel>
      )}
      <CommandPalette />
    </div>
  );
}
